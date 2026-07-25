use anyhow::{anyhow, bail, Context, Result};
use clap::Parser;
use reqwest::blocking::Client;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tempfile::{Builder, TempDir};
use url::Url;

mod e2e_tests;
mod scenarios;

const RESET: &str = "\x1b[0m";
const RED: &str = "\x1b[31m";
const GREEN: &str = "\x1b[32m";
const YELLOW: &str = "\x1b[33m";
const CYAN: &str = "\x1b[36m";
const DIM: &str = "\x1b[2m";
const BOLD: &str = "\x1b[1m";

#[derive(Parser, Debug)]
#[command(
    name = "verdaccio-e2e",
    disable_version_flag = true,
    after_help = "Examples:\n  verdaccio-e2e -r http://localhost:4873 --pm npm --pm pnpm\n  verdaccio-e2e -r http://localhost:4873 --test publish --test install\n  verdaccio-e2e -r http://localhost:4873 --pm yarn-modern@4 -v"
)]
struct Cli {
    #[arg(short = 'r', long = "registry")]
    registry: String,
    #[arg(long = "pm")]
    pm: Vec<String>,
    #[arg(short = 't', long = "test")]
    test: Vec<String>,
    #[arg(short = 'c', long = "concurrency", default_value_t = 1)]
    concurrency: usize,
    #[arg(long = "timeout", default_value_t = 50_000)]
    timeout: u64,
    #[arg(long = "token")]
    token: Option<String>,
    #[arg(short = 'v', long = "verbose")]
    verbose: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum AdapterType {
    Npm,
    Pnpm,
    YarnClassic,
    YarnModern,
    Bun,
    Deno,
}

#[derive(Clone, Debug)]
struct Adapter {
    name: String,
    kind: AdapterType,
    bin: String,
    supports: BTreeSet<&'static str>,
    version: String,
    yarn_major: u64,
}

#[derive(Debug)]
struct ExecOutput {
    stdout: String,
    stderr: String,
}

#[derive(Debug)]
struct TestResult {
    name: &'static str,
    passed: bool,
    duration: Duration,
    error: Option<String>,
    sub_tests: Vec<SubTestResult>,
}

#[derive(Debug)]
struct SubTestResult {
    label: &'static str,
    passed: bool,
    duration: Duration,
    error: Option<String>,
}

#[derive(Debug)]
struct SuiteResult {
    adapter: String,
    tests: Vec<TestResult>,
    passed: usize,
    failed: usize,
    skipped: usize,
    duration: Duration,
}

struct RunState {
    temp_dirs: Vec<TempDir>,
    verbose: bool,
}

struct TestContext<'a> {
    registry_url: String,
    token: String,
    port: u16,
    adapter: Adapter,
    run_id: String,
    state: &'a mut RunState,
    sub_results: Vec<SubTestResult>,
}

struct TestDefinition {
    name: &'static str,
    requires: &'static [&'static str],
    applies_to: fn(&Adapter) -> bool,
    run: fn(&mut TestContext<'_>) -> Result<()>,
}

fn main() {
    let code = match run() {
        Ok(code) => code,
        Err(err) => {
            eprintln!("{RED}Error:{RESET} {err:#}");
            1
        }
    };
    std::process::exit(code);
}

fn run() -> Result<i32> {
    let cli = Cli::parse();
    let mut state = RunState {
        temp_dirs: Vec::new(),
        verbose: cli.verbose,
    };

    let run_dir = create_temp_dir(&mut state, "e2e-run")?;
    env::set_current_dir(run_dir.path()).context("failed to enter isolated run directory")?;

    println!("Checking registry at {}...", cli.registry);
    if !ping_registry(&cli.registry) {
        bail!("Registry at {} is not reachable", cli.registry);
    }
    println!("Registry is alive.");

    let token = match cli.token {
        Some(token) => token,
        None => {
            println!("Creating test user...");
            let user = format!("e2e-user-{}", now_millis());
            let token = create_user(&cli.registry, &user, "e2e-test-password")?;
            println!("User \"{user}\" created.");
            token
        }
    };

    let adapters = parse_adapters(&cli.pm)?;
    println!(
        "Adapters: {}",
        adapters
            .iter()
            .map(|adapter| adapter.name.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    );

    let tests = e2e_tests::all_tests();
    let selected = if cli.test.is_empty() {
        tests.iter().map(|test| test.name).collect::<Vec<_>>()
    } else {
        cli.test.iter().map(String::as_str).collect::<Vec<_>>()
    };
    println!("Tests: {}", selected.join(", "));

    let results = run_all(
        &adapters,
        &tests,
        &cli.registry,
        &token,
        &cli.test,
        cli.timeout,
        &mut state,
    );
    report_summary(&results)?;
    Ok(if results.iter().any(|suite| suite.failed > 0) {
        1
    } else {
        0
    })
}

fn run_all(
    adapters: &[Adapter],
    tests: &[TestDefinition],
    registry_url: &str,
    token: &str,
    test_filter: &[String],
    timeout_ms: u64,
    state: &mut RunState,
) -> Vec<SuiteResult> {
    let mut results = Vec::new();
    for adapter in adapters {
        results.push(run_suite(
            adapter,
            tests,
            registry_url,
            token,
            test_filter,
            timeout_ms,
            state,
        ));
    }
    results
}

fn run_suite(
    adapter: &Adapter,
    tests: &[TestDefinition],
    registry_url: &str,
    token: &str,
    test_filter: &[String],
    timeout_ms: u64,
    state: &mut RunState,
) -> SuiteResult {
    let suite_start = Instant::now();
    let mut results = Vec::new();
    let mut skipped = 0usize;
    println!("\n{BOLD}{CYAN}{}{RESET}", adapter.name);

    for test in tests {
        if !test_filter.is_empty() && !test_filter.iter().any(|name| name == test.name) {
            continue;
        }
        let unsupported = test
            .requires
            .iter()
            .any(|command| !adapter.supports.contains(command));
        if unsupported || !(test.applies_to)(adapter) {
            println!("  {YELLOW}SKIP{RESET} {}", test.name);
            skipped += 1;
            continue;
        }

        println!("  {DIM}running{RESET} {} > {}...", adapter.name, test.name);
        let started = Instant::now();
        let port = get_port(registry_url);
        let mut ctx = TestContext {
            registry_url: registry_url.to_string(),
            token: token.to_string(),
            port,
            adapter: adapter.clone(),
            run_id: run_id(),
            state,
            sub_results: Vec::new(),
        };

        let result = match (test.run)(&mut ctx) {
            Ok(()) if started.elapsed() > Duration::from_millis(timeout_ms) => TestResult {
                name: test.name,
                passed: false,
                duration: started.elapsed(),
                error: Some(format!("Test timed out after {timeout_ms}ms")),
                sub_tests: ctx.sub_results,
            },
            Ok(()) => TestResult {
                name: test.name,
                passed: true,
                duration: started.elapsed(),
                error: None,
                sub_tests: ctx.sub_results,
            },
            Err(err) => TestResult {
                name: test.name,
                passed: false,
                duration: started.elapsed(),
                error: Some(format!("{err:#}")),
                sub_tests: ctx.sub_results,
            },
        };
        report_test_result(&result);
        results.push(result);
    }

    let passed = results.iter().filter(|result| result.passed).count();
    let failed = results.iter().filter(|result| !result.passed).count();
    SuiteResult {
        adapter: adapter.name.clone(),
        tests: results,
        passed,
        failed,
        skipped,
        duration: suite_start.elapsed(),
    }
}

fn parse_adapters(filters: &[String]) -> Result<Vec<Adapter>> {
    if filters.is_empty() {
        return Ok(vec![create_adapter("npm", None, None)?]);
    }
    filters
        .iter()
        .map(|filter| {
            let (name, version, bin_path) = parse_pm_spec(filter);
            create_adapter(&name, version.as_deref(), bin_path.as_deref())
        })
        .collect()
}

fn parse_pm_spec(filter: &str) -> (String, Option<String>, Option<String>) {
    if let Some((name, bin)) = filter.split_once('=') {
        return (name.to_ascii_lowercase(), None, Some(bin.to_string()));
    }
    if let Some((name, version)) = filter.split_once('@') {
        return (name.to_ascii_lowercase(), Some(version.to_string()), None);
    }
    (filter.to_ascii_lowercase(), None, None)
}

fn create_adapter(name: &str, version: Option<&str>, bin_path: Option<&str>) -> Result<Adapter> {
    match name {
        "npm" => {
            let bin = resolve_installed_bin(bin_path, version, "npm", "npm", "npm")?;
            let resolved = detect_version(&bin, &[])?;
            Ok(Adapter {
                name: format!("npm@{resolved}"),
                kind: AdapterType::Npm,
                bin,
                supports: set(&["publish", "unpublish", "install", "info", "audit", "deprecate", "dist-tag", "ping", "search"]),
                version: resolved,
                yarn_major: 0,
            })
        }
        "pnpm" => {
            let bin = resolve_installed_bin(bin_path, version, "pnpm", "pnpm", "pnpm")?;
            let resolved = detect_version(&bin, &[])?;
            let major = parse_major(&resolved);
            let supports = if major >= 11 {
                set(&["publish", "unpublish", "install", "info", "audit", "deprecate"])
            } else {
                set(&["publish", "unpublish", "install", "info", "audit", "deprecate", "dist-tag", "ping", "search"])
            };
            Ok(Adapter {
                name: format!("pnpm@{resolved}"),
                kind: AdapterType::Pnpm,
                bin,
                supports,
                version: resolved,
                yarn_major: 0,
            })
        }
        "yarn-classic" | "yarn1" => {
            let bin = match (bin_path, version) {
                (Some(bin), _) => bin.to_string(),
                (_, Some(version)) => {
                    let package = if version.starts_with('1') {
                        format!("yarn@{version}")
                    } else {
                        "yarn@1".to_string()
                    };
                    install_package_bin(&package, "node_modules/.bin/yarn")?
                }
                _ => resolve_yarn_classic_bin()?,
            };
            let resolved = detect_version_with_env(&bin, &[], yarn_base_env())?;
            Ok(Adapter {
                name: format!("yarn-classic@{resolved}"),
                kind: AdapterType::YarnClassic,
                bin,
                supports: set(&["publish", "install", "info", "audit"]),
                version: resolved,
                yarn_major: 1,
            })
        }
        "yarn-modern" | "yarn" => {
            let bin = match (bin_path, version) {
                (Some(bin), _) => bin.to_string(),
                (_, Some(version)) => install_package_bin(&format!("@yarnpkg/cli-dist@{version}"), "node_modules/@yarnpkg/cli-dist/bin/yarn.js")?,
                _ => resolve_yarn_modern_bin()?,
            };
            let resolved = detect_version_with_env(&bin, &[], yarn_base_env())?;
            let major = parse_major(&resolved);
            Ok(Adapter {
                name: format!("yarn-modern@{resolved}"),
                kind: AdapterType::YarnModern,
                bin,
                supports: set(&["publish", "install", "info", "ping", "deprecate", "login"]),
                version: resolved,
                yarn_major: major,
            })
        }
        "bun" => {
            let bin = bin_path.unwrap_or("bun").to_string();
            let resolved = detect_version(&bin, &[])?;
            Ok(Adapter {
                name: format!("bun@{resolved}"),
                kind: AdapterType::Bun,
                bin,
                supports: set(&["publish", "install", "info", "audit"]),
                version: resolved,
                yarn_major: 0,
            })
        }
        "deno" => {
            let bin = bin_path.unwrap_or("deno").to_string();
            let output = command_output(&bin, &["--version"], None, &[], false)?;
            let resolved = output
                .stdout
                .lines()
                .find_map(|line| line.strip_prefix("deno ").map(str::to_string))
                .unwrap_or_else(|| "unknown".to_string());
            Ok(Adapter {
                name: format!("deno@{resolved}"),
                kind: AdapterType::Deno,
                bin,
                supports: set(&["install", "info"]),
                version: resolved,
                yarn_major: 0,
            })
        }
        other => bail!("Unknown package manager: \"{other}\". Supported: npm, pnpm, yarn-classic, yarn-modern, bun, deno"),
    }
}

fn set(items: &[&'static str]) -> BTreeSet<&'static str> {
    items.iter().copied().collect()
}

fn resolve_installed_bin(
    bin_path: Option<&str>,
    version: Option<&str>,
    package_name: &str,
    default_bin: &str,
    bin_rel: &str,
) -> Result<String> {
    if let Some(bin) = bin_path {
        return Ok(bin.to_string());
    }
    if let Some(version) = version {
        return install_package_bin(
            &format!("{package_name}@{version}"),
            &format!("node_modules/.bin/{bin_rel}"),
        );
    }
    Ok(default_bin.to_string())
}

fn resolve_yarn_classic_bin() -> Result<String> {
    if let Ok(output) = command_output("which", &["yarn"], None, &[], false) {
        let bin = output.stdout.trim();
        if !bin.is_empty() {
            let version = detect_version_with_env(bin, &[], yarn_base_env())
                .unwrap_or_else(|_| "unknown".to_string());
            if parse_major(&version) == 1 {
                return Ok(bin.to_string());
            }
        }
    }
    install_package_bin("yarn@1", "node_modules/.bin/yarn")
}

fn resolve_yarn_modern_bin() -> Result<String> {
    if let Ok(output) = command_output("which", &["yarn"], None, &[], false) {
        let bin = output.stdout.trim();
        if !bin.is_empty() {
            let version = detect_version_with_env(bin, &[], yarn_base_env())
                .unwrap_or_else(|_| "unknown".to_string());
            if parse_major(&version) >= 2 {
                return Ok(bin.to_string());
            }
        }
    }
    install_package_bin(
        "@yarnpkg/cli-dist@4",
        "node_modules/@yarnpkg/cli-dist/bin/yarn.js",
    )
}

fn install_package_bin(package: &str, bin_rel: &str) -> Result<String> {
    let dir = tempfile::tempdir().context("failed to create package-manager install dir")?;
    let path = dir.keep();
    let prefix = path.to_string_lossy().to_string();
    command_output(
        "npm",
        &["install", "--prefix", &prefix, package, "--loglevel=error"],
        None,
        &[],
        false,
    )
    .with_context(|| format!("failed to install {package}"))?;
    let bin = path.join(bin_rel).to_string_lossy().to_string();
    let installed = detect_version(&bin, &[]).unwrap_or_else(|_| "unknown".to_string());
    println!(
        "  Auto-installed {} {}",
        package.split('@').next().unwrap_or(package),
        installed
    );
    Ok(bin)
}

fn detect_version(bin: &str, args: &[&str]) -> Result<String> {
    detect_version_with_env(bin, args, Vec::new())
}

fn detect_version_with_env(
    bin: &str,
    args: &[&str],
    envs: Vec<(&'static str, &'static str)>,
) -> Result<String> {
    let mut full_args = Vec::from(args);
    full_args.push("--version");
    Ok(command_output(bin, &full_args, None, &envs, false)?
        .stdout
        .trim()
        .to_string())
}

fn parse_major(version: &str) -> u64 {
    version
        .split('.')
        .next()
        .and_then(|part| part.parse().ok())
        .unwrap_or(0)
}

fn yarn_base_env() -> Vec<(&'static str, &'static str)> {
    vec![("COREPACK_ENABLE_STRICT", "0"), ("YARN_IGNORE_PATH", "1")]
}

fn yarn_env(adapter: &Adapter) -> Vec<(&'static str, &'static str)> {
    let mut envs = yarn_base_env();
    if adapter.yarn_major >= 4 {
        envs.push(("YARN_ENABLE_HARDENED_MODE", "0"));
        envs.push(("YARN_NPM_MINIMAL_AGE_GATE", "0"));
    }
    envs
}

fn command_output(
    bin: &str,
    args: &[&str],
    cwd: Option<&Path>,
    envs: &[(&str, &str)],
    verbose: bool,
) -> Result<ExecOutput> {
    if verbose {
        let cwd_label = cwd
            .and_then(|path| path.file_name())
            .and_then(|name| name.to_str())
            .map(|name| format!(" {DIM}(cwd: {name}){RESET}"))
            .unwrap_or_default();
        println!(
            "      {CYAN}${RESET} {} {}{}",
            short_bin(bin),
            args.join(" "),
            cwd_label
        );
    }

    let started = Instant::now();
    let mut command = Command::new(bin);
    command.args(args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    for (key, value) in envs {
        command.env(key, value);
    }
    let output = command
        .output()
        .with_context(|| format!("failed to start command: {bin} {}", args.join(" ")))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if verbose {
        let status = if output.status.success() {
            format!("{GREEN}ok{RESET}")
        } else {
            format!("{RED}exit {}{RESET}", output.status.code().unwrap_or(-1))
        };
        println!(
            "      {DIM}  -> {status} {DIM}({}){RESET}",
            format_duration(started.elapsed())
        );
    }

    if output.status.success() {
        Ok(ExecOutput { stdout, stderr })
    } else {
        bail!(
            "Running \"{} {}\" returned error code {}...\n\nSTDOUT:\n{}\n\nSTDERR:\n{}\n",
            bin,
            args.join(" "),
            output.status.code().unwrap_or(-1),
            stdout,
            stderr
        )
    }
}

fn short_bin(bin: &str) -> &str {
    Path::new(bin)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(bin)
}

fn exec_adapter(
    ctx: &TestContext<'_>,
    cwd: Option<&Path>,
    args: Vec<String>,
) -> Result<ExecOutput> {
    let args = normalize_adapter_args(&ctx.adapter, args);
    let refs = args.iter().map(String::as_str).collect::<Vec<_>>();
    let envs = match ctx.adapter.kind {
        AdapterType::YarnClassic | AdapterType::YarnModern => yarn_env(&ctx.adapter),
        _ => Vec::new(),
    };
    command_output(&ctx.adapter.bin, &refs, cwd, &envs, ctx.state.verbose)
}

fn normalize_adapter_args(adapter: &Adapter, args: Vec<String>) -> Vec<String> {
    match adapter.kind {
        AdapterType::Pnpm if parse_major(&adapter.version) >= 11 => {
            let cmd = args.first().map(String::as_str).unwrap_or_default();
            let mut filtered = if matches!(cmd, "deprecate" | "unpublish" | "publish" | "dist-tag")
            {
                args.into_iter()
                    .filter(|arg| arg != "--json" && !arg.starts_with("--loglevel"))
                    .collect::<Vec<_>>()
            } else if cmd == "version" {
                args.into_iter()
                    .filter(|arg| {
                        !arg.starts_with("--registry")
                            && !arg.starts_with("--loglevel")
                            && !arg.starts_with("--no--git-tag-version")
                    })
                    .collect::<Vec<_>>()
            } else {
                args
            };
            if filtered.first().map(String::as_str) == Some("deprecate")
                && filtered.get(2).map(String::as_str) == Some("")
            {
                let mut updated = vec!["undeprecate".to_string(), filtered[1].clone()];
                updated.extend(filtered.drain(3..));
                filtered = updated;
            }
            filtered
        }
        AdapterType::YarnModern => {
            let cmd = args.first().cloned().unwrap_or_default();
            let mut rest = args
                .into_iter()
                .skip(1)
                .filter(|arg| !arg.starts_with("--registry"))
                .collect::<Vec<_>>();
            match cmd.as_str() {
                "publish" => {
                    rest.retain(|arg| arg != "--json");
                    let mut out = vec!["npm".to_string(), "publish".to_string()];
                    out.extend(rest);
                    out
                }
                "info" => prepend(&["npm", "info"], rest),
                "ping" => prepend(&["npm", "ping"], rest),
                "deprecate" => prepend(&["npm", "deprecate"], rest),
                "login" => prepend(&["npm", "login"], rest),
                "whoami" => prepend(&["npm", "whoami"], rest),
                _ => {
                    let mut out = vec![cmd.to_string()];
                    out.extend(rest);
                    out
                }
            }
        }
        AdapterType::Bun if args.first().map(String::as_str) == Some("info") => {
            let pkg = args.get(1).cloned().unwrap_or_default();
            let cleaned = args
                .into_iter()
                .skip(2)
                .filter(|arg| arg != "--registry" && !arg.starts_with("http"))
                .collect::<Vec<_>>();
            let mut out = vec!["info".to_string(), pkg];
            out.extend(cleaned);
            out
        }
        AdapterType::Deno if args.first().map(String::as_str) == Some("info") => {
            let pkg = args.get(1).cloned().unwrap_or_default();
            let mut out = vec![
                "info".to_string(),
                format!("npm:{pkg}"),
                "--node-modules-dir=auto".to_string(),
            ];
            out.extend(args.into_iter().skip(2).filter(|arg| arg != "--json"));
            out
        }
        AdapterType::Deno if args.first().map(String::as_str) == Some("install") => {
            vec!["install".to_string()]
        }
        _ => args,
    }
}

fn prepend(prefix: &[&str], rest: Vec<String>) -> Vec<String> {
    let mut out = prefix
        .iter()
        .map(|item| item.to_string())
        .collect::<Vec<_>>();
    out.extend(rest);
    out
}

fn registry_arg(adapter: &Adapter, url: &str) -> Vec<String> {
    match adapter.kind {
        AdapterType::Deno | AdapterType::YarnModern => Vec::new(),
        _ => vec!["--registry".to_string(), url.to_string()],
    }
}

fn prepare_project(
    ctx: &mut TestContext<'_>,
    package_name: &str,
    version: &str,
    dependencies: BTreeMap<String, String>,
    dev_dependencies: BTreeMap<String, String>,
) -> Result<PathBuf> {
    let dir = create_temp_dir(ctx.state, package_name)?;
    let path = dir.path().to_path_buf();
    fs::write(
        path.join("package.json"),
        package_json(package_name, version, dependencies, dev_dependencies)?,
    )?;
    fs::write(path.join("README.md"), readme(package_name))?;

    if ctx.adapter.kind == AdapterType::YarnModern {
        let yaml = yarn_config(&ctx.registry_url, Some(&ctx.token), ctx.adapter.yarn_major)?;
        fs::write(path.join(".yarnrc.yml"), yaml)?;
    } else {
        let npmrc = format!(
            "//localhost:{}/:_authToken={}\nregistry={}\nmin-release-age=0\nminimum-release-age=0",
            ctx.port, ctx.token, ctx.registry_url
        );
        fs::write(path.join(".npmrc"), npmrc)?;
        if ctx.adapter.kind == AdapterType::Pnpm {
            fs::write(path.join("pnpm-workspace.yaml"), "minimumReleaseAge: 0\n")?;
        }
    }
    Ok(path)
}

fn package_json(
    package_name: &str,
    version: &str,
    dependencies: BTreeMap<String, String>,
    dev_dependencies: BTreeMap<String, String>,
) -> Result<String> {
    Ok(serde_json::to_string(&json!({
        "name": package_name,
        "version": version,
        "description": "some cool project",
        "main": "index.js",
        "scripts": { "test": "echo exit 1" },
        "dependencies": dependencies,
        "devDependencies": dev_dependencies,
        "keywords": ["foo", "bar"],
        "author": "Verdaccio E2E <verdaccio@example.org>",
        "license": "MIT"
    }))?)
}

fn readme(package_name: &str) -> String {
    format!("\n   # My README {package_name}\n\n   some text\n\n   ## subtitle\n\n   more text\n  ")
}

fn yarn_config(registry: &str, token: Option<&str>, major: u64) -> Result<String> {
    let mut value = serde_yaml::Mapping::new();
    value.insert("npmRegistryServer".into(), registry.into());
    value.insert("enableImmutableInstalls".into(), false.into());
    value.insert("unsafeHttpWhitelist".into(), vec!["localhost"].into());
    if major >= 4 {
        value.insert("enableHardenedMode".into(), false.into());
        value.insert("npmMinimalAgeGate".into(), 0.into());
    }
    if let Some(token) = token {
        let mut registry_config = serde_yaml::Mapping::new();
        registry_config.insert("npmAlwaysAuth".into(), true.into());
        registry_config.insert("npmAuthToken".into(), token.into());
        let mut registries = serde_yaml::Mapping::new();
        registries.insert(registry.into(), registry_config.into());
        value.insert("npmRegistries".into(), registries.into());
    }
    Ok(serde_yaml::to_string(&value)?)
}

fn create_temp_dir<'a>(state: &'a mut RunState, prefix: &str) -> Result<&'a TempDir> {
    let sanitized = prefix
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>();
    let dir = Builder::new()
        .prefix(&format!("verdaccio-e2e-{sanitized}-"))
        .tempdir()
        .context("failed to create temp dir")?;
    state.temp_dirs.push(dir);
    Ok(state.temp_dirs.last().expect("temp dir was just pushed"))
}

fn ping_registry(registry_url: &str) -> bool {
    Client::new()
        .get(format!("{}/-/ping", registry_url.trim_end_matches('/')))
        .timeout(Duration::from_secs(10))
        .send()
        .map(|resp| resp.status().is_success())
        .unwrap_or(false)
}

fn create_user(registry_url: &str, user: &str, password: &str) -> Result<String> {
    let url = format!(
        "{}/-/user/org.couchdb.user:{}",
        registry_url.trim_end_matches('/'),
        user
    );
    let body = json!({
        "name": user,
        "password": password,
        "_id": format!("org.couchdb.user:{user}"),
        "type": "user",
        "roles": [],
        "date": chrono_free_iso_now(),
    });
    let response = Client::new()
        .put(url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .context("failed to create registry user")?;
    let status = response.status();
    let body: Value = response.json().unwrap_or(Value::Null);
    if matches!(status.as_u16(), 200 | 201 | 409) {
        if let Some(token) = body.get("token").and_then(Value::as_str) {
            return Ok(token.to_string());
        }
    }
    bail!("Failed to create/login user \"{user}\" on {registry_url}: {status} {body}")
}

fn chrono_free_iso_now() -> String {
    format!("{}", now_millis())
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn run_id() -> String {
    format!("{:x}", now_millis())
}

fn get_port(registry_url: &str) -> u16 {
    Url::parse(registry_url)
        .ok()
        .and_then(|url| {
            url.port().or_else(|| {
                if url.scheme() == "https" {
                    Some(443)
                } else {
                    Some(80)
                }
            })
        })
        .unwrap_or(4873)
}

fn sub_test(
    ctx: &mut TestContext<'_>,
    label: &'static str,
    f: impl FnOnce(&mut TestContext<'_>) -> Result<()>,
) -> Result<()> {
    let started = Instant::now();
    match f(ctx) {
        Ok(()) => {
            let duration = started.elapsed();
            ctx.sub_results.push(SubTestResult {
                label,
                passed: true,
                duration,
                error: None,
            });
            report_sub_test(label, true, duration);
            Ok(())
        }
        Err(err) => {
            let duration = started.elapsed();
            let error = format!("{err:#}");
            ctx.sub_results.push(SubTestResult {
                label,
                passed: false,
                duration,
                error: Some(error.clone()),
            });
            report_sub_test(label, false, duration);
            Err(anyhow!(error))
        }
    }
}

fn prepare_deprecate_project(
    ctx: &mut TestContext<'_>,
    pkg: &str,
    version: &str,
) -> Result<PathBuf> {
    let temp = prepare_project(ctx, pkg, version, BTreeMap::new(), BTreeMap::new())?;
    if ctx.adapter.kind == AdapterType::YarnModern {
        import_plugin(ctx, &temp, "npm-deprecate")?;
    }
    Ok(temp)
}

fn publish_pkg(ctx: &TestContext<'_>, temp: &Path) -> Result<()> {
    publish_pkg_extra(ctx, temp, Vec::new())
}

fn publish_pkg_extra(ctx: &TestContext<'_>, temp: &Path, extra: Vec<String>) -> Result<()> {
    if ctx.adapter.kind == AdapterType::YarnModern {
        exec_adapter(ctx, Some(temp), vec!["install".into()])?;
    }
    let mut args = vec!["publish".into()];
    args.extend(extra);
    args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
    exec_adapter(ctx, Some(temp), args)?;
    Ok(())
}

fn publish_seed(
    ctx: &mut TestContext<'_>,
    pkg: &str,
    version: &str,
    deps: BTreeMap<String, String>,
) -> Result<()> {
    let temp = prepare_project(ctx, pkg, version, deps, BTreeMap::new())?;
    publish_pkg(ctx, &temp)
}

fn deprecate_pkg(
    ctx: &TestContext<'_>,
    temp: &Path,
    package_version: &str,
    message: &str,
) -> Result<()> {
    let mut args = vec!["deprecate".into(), package_version.into(), message.into()];
    if ctx.adapter.kind != AdapterType::YarnModern {
        args.push("--json".into());
    }
    args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
    exec_adapter(ctx, Some(temp), args)?;
    Ok(())
}

fn info_pkg(ctx: &TestContext<'_>, temp: &Path, pkg: &str) -> Result<Value> {
    let mut args = vec!["info".into(), pkg.into(), "--json".into()];
    args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
    let resp = exec_adapter(ctx, Some(temp), args)?;
    if ctx.adapter.kind == AdapterType::YarnClassic {
        for line in resp.stdout.lines() {
            if let Ok(value) = serde_json::from_str::<Value>(line) {
                if value.get("type").and_then(Value::as_str) == Some("inspect") {
                    return Ok(normalize_info(
                        value.get("data").cloned().unwrap_or(Value::Null),
                    ));
                }
            }
        }
    }
    parse_info_json(&resp.stdout)
}

fn parse_info_json(stdout: &str) -> Result<Value> {
    Ok(normalize_info(serde_json::from_str(stdout)?))
}

fn normalize_info(value: Value) -> Value {
    if let Some(array) = value.as_array() {
        array.last().cloned().unwrap_or(Value::Null)
    } else {
        value
    }
}

fn bump_version(ctx: &TestContext<'_>, temp: &Path, bump: &str) -> Result<()> {
    if ctx.adapter.kind == AdapterType::YarnModern {
        let path = temp.join("package.json");
        let mut pkg: Value = serde_json::from_str(&fs::read_to_string(&path)?)?;
        let current = pkg
            .get("version")
            .and_then(Value::as_str)
            .unwrap_or("1.0.0");
        let mut parts = current
            .split('.')
            .map(|p| p.parse::<u64>().unwrap_or(0))
            .collect::<Vec<_>>();
        while parts.len() < 3 {
            parts.push(0);
        }
        match bump {
            "major" => {
                parts[0] += 1;
                parts[1] = 0;
                parts[2] = 0;
            }
            _ => {
                parts[1] += 1;
                parts[2] = 0;
            }
        }
        pkg["version"] = format!("{}.{}.{}", parts[0], parts[1], parts[2]).into();
        fs::write(path, serde_json::to_string_pretty(&pkg)?)?;
    } else {
        let mut args = vec![
            "version".into(),
            bump.into(),
            "--no--git-tag-version".into(),
            "--loglevel=info".into(),
        ];
        args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
        exec_adapter(ctx, Some(temp), args)?;
    }
    Ok(())
}

fn prepare_login_project(ctx: &mut TestContext<'_>, name: &str) -> Result<PathBuf> {
    let temp = create_temp_dir(ctx.state, name)?.path().to_path_buf();
    fs::write(
        temp.join(".yarnrc.yml"),
        yarn_config(&ctx.registry_url, None, ctx.adapter.yarn_major)?,
    )?;
    fs::write(
        temp.join("package.json"),
        serde_json::to_string(&json!({ "name": name, "version": "1.0.0" }))?,
    )?;
    import_plugin(ctx, &temp, "npm-login")?;
    Ok(temp)
}

fn yarn_login(
    ctx: &TestContext<'_>,
    cwd: &Path,
    user: &str,
    password: &str,
    email: &str,
) -> Result<ExecOutput> {
    exec_adapter(
        ctx,
        Some(cwd),
        vec![
            "login".into(),
            "--auth-type=legacy".into(),
            format!("--user={user}"),
            format!("--password={password}"),
            format!("--email={email}"),
        ],
    )
}

fn yarn_whoami(ctx: &TestContext<'_>, cwd: &Path) -> Result<String> {
    Ok(exec_adapter(ctx, Some(cwd), vec!["whoami".into()])?.stdout)
}

fn import_plugin(ctx: &TestContext<'_>, cwd: &Path, plugin_name: &str) -> Result<()> {
    if ctx.adapter.kind != AdapterType::YarnModern {
        return Ok(());
    }
    let tmp = tempfile::tempdir()?;
    let tmp_path = tmp.path().to_string_lossy().to_string();
    let pkg = format!("@verdaccio/yarn-plugin-{plugin_name}");
    command_output(
        "npm",
        &["pack", &pkg, "--pack-destination", &tmp_path],
        None,
        &[],
        false,
    )?;
    command_output(
        "tar",
        &["xzf", &format!("{tmp_path}/*.tgz"), "-C", &tmp_path],
        None,
        &[],
        false,
    )
    .or_else(|_| {
        let tgz = fs::read_dir(tmp.path())?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .find(|path| path.extension().and_then(|ext| ext.to_str()) == Some("tgz"))
            .ok_or_else(|| anyhow!("failed to find packed yarn plugin"))?;
        let tgz_str = tgz.to_string_lossy().to_string();
        command_output("tar", &["xzf", &tgz_str, "-C", &tmp_path], None, &[], false)
    })?;
    let bundle = tmp
        .path()
        .join(format!("package/bundles/@yarnpkg/plugin-{plugin_name}.js"));
    let bundle = bundle.to_string_lossy().to_string();
    exec_adapter(
        ctx,
        Some(cwd),
        vec!["plugin".into(), "import".into(), bundle],
    )?;
    Ok(())
}

fn prepare_cooldown_consumer(
    ctx: &mut TestContext<'_>,
    name: &str,
    deps: BTreeMap<String, String>,
) -> Result<PathBuf> {
    let temp = prepare_project(ctx, name, "1.0.0", deps, BTreeMap::new())?;
    fs::write(
        temp.join(".npmrc"),
        format!(
            "//localhost:{}/:_authToken={}\nregistry={}",
            ctx.port, ctx.token, ctx.registry_url
        ),
    )?;
    fs::write(
        temp.join("pnpm-workspace.yaml"),
        "minimumReleaseAge: 10080\nminimumReleaseAgeExclude:\n  - '@verdaccio/*'\n  - 'verdaccio-*'\n",
    )?;
    Ok(temp)
}

fn is_pnpm_minimum_release_age_capable(adapter: &Adapter) -> bool {
    if adapter.kind != AdapterType::Pnpm {
        return false;
    }
    let mut parts = adapter
        .version
        .split('.')
        .filter_map(|part| part.parse::<u64>().ok());
    let major = parts.next().unwrap_or(0);
    let minor = parts.next().unwrap_or(0);
    major > 11 || (major == 11 && minor >= 1)
}

fn assert_true(condition: bool, message: &str) -> Result<()> {
    if condition {
        Ok(())
    } else {
        bail!("{message}")
    }
}

fn assert_contains(haystack: &str, needle: &str) -> Result<()> {
    assert_true(
        haystack.contains(needle),
        &format!("Expected output to contain \"{needle}\" but got \"{haystack}\""),
    )
}

fn assert_eq_str(actual: &str, expected: &str) -> Result<()> {
    if actual == expected {
        Ok(())
    } else {
        bail!("Expected \"{expected}\" but got \"{actual}\"")
    }
}

fn assert_eq_json<T: Into<Value>>(
    actual: Option<&Value>,
    expected: T,
    message: &str,
) -> Result<()> {
    let expected = expected.into();
    if actual == Some(&expected) {
        Ok(())
    } else {
        bail!(
            "{message}: expected {expected}, got {}",
            actual.cloned().unwrap_or(Value::Null)
        )
    }
}

fn report_test_result(result: &TestResult) {
    if result.passed {
        if result.sub_tests.is_empty() {
            println!(
                "  {GREEN}✓{RESET} {} {DIM}{}{RESET}",
                result.name,
                format_duration(result.duration)
            );
        } else {
            println!(
                "  {GREEN}PASS{RESET} {} {DIM}{}{RESET}",
                result.name,
                format_duration(result.duration)
            );
        }
    } else {
        println!(
            "  {RED}FAIL{RESET} {} {DIM}{}{RESET}",
            result.name,
            format_duration(result.duration)
        );
        if let Some(error) = &result.error {
            for line in error.lines() {
                println!("    {RED}{line}{RESET}");
            }
            if env::var_os("GITHUB_ACTIONS").is_some() {
                let first = error.lines().next().unwrap_or(error);
                println!("::error title=E2E {}::{first}", result.name);
            }
        }
    }
}

fn report_sub_test(label: &str, passed: bool, duration: Duration) {
    let icon = if passed {
        format!("{BOLD}{GREEN}✓{RESET}")
    } else {
        format!("{BOLD}{RED}✗{RESET}")
    };
    println!(
        "\n    {icon} {BOLD}{label}{RESET} {DIM}{}{RESET}\n",
        format_duration(duration)
    );
}

fn report_summary(results: &[SuiteResult]) -> Result<()> {
    println!("\n{BOLD}{}{RESET}", "=".repeat(50));
    println!("{BOLD}Summary{RESET}\n");
    let mut total_passed = 0usize;
    let mut total_failed = 0usize;
    let mut total_skipped = 0usize;
    let mut total_duration = Duration::ZERO;
    for suite in results {
        let color = if suite.failed > 0 { RED } else { GREEN };
        let icon = if suite.failed > 0 { "x" } else { "v" };
        println!(
            "  {color}{icon}{RESET} {}: {GREEN}{} passed{RESET}, {RED}{} failed{RESET}, {YELLOW}{} skipped{RESET} {DIM}({}){RESET}",
            suite.adapter,
            suite.passed,
            suite.failed,
            suite.skipped,
            format_duration(suite.duration)
        );
        total_passed += suite.passed;
        total_failed += suite.failed;
        total_skipped += suite.skipped;
        total_duration += suite.duration;
    }
    println!(
        "\n  Total: {GREEN}{total_passed} passed{RESET}, {RED}{total_failed} failed{RESET}, {YELLOW}{total_skipped} skipped{RESET} {DIM}({}){RESET}",
        format_duration(total_duration)
    );
    println!("{BOLD}{}{RESET}\n", "=".repeat(50));
    if let Some(summary) = env::var_os("GITHUB_STEP_SUMMARY") {
        write_github_summary(Path::new(&summary), results)?;
    }
    Ok(())
}

fn write_github_summary(path: &Path, results: &[SuiteResult]) -> Result<()> {
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    writeln!(file, "## E2E Test Results\n")?;
    for suite in results {
        let status = if suite.failed > 0 { "❌" } else { "✅" };
        writeln!(file, "### {status} {}\n", suite.adapter)?;
        writeln!(file, "| Test | Status | Duration |")?;
        writeln!(file, "|------|--------|----------|")?;
        for test in &suite.tests {
            let icon = if test.passed { "✅" } else { "❌" };
            writeln!(
                file,
                "| {} | {} | {} |",
                test.name,
                icon,
                format_duration(test.duration)
            )?;
            for sub in &test.sub_tests {
                let icon = if sub.passed { "✅" } else { "❌" };
                let label = if sub.passed {
                    sub.label.to_string()
                } else {
                    format!("{}: {}", sub.label, sub.error.as_deref().unwrap_or(""))
                };
                writeln!(
                    file,
                    "| &nbsp;&nbsp;&nbsp;&nbsp;{} | {} | {} |",
                    label,
                    icon,
                    format_duration(sub.duration)
                )?;
            }
        }
        writeln!(file)?;
    }
    let total_passed: usize = results.iter().map(|suite| suite.passed).sum();
    let total_failed: usize = results.iter().map(|suite| suite.failed).sum();
    let total_skipped: usize = results.iter().map(|suite| suite.skipped).sum();
    let emoji = if total_failed > 0 { "❌" } else { "✅" };
    writeln!(file, "{emoji} **{total_passed} passed**, **{total_failed} failed**, **{total_skipped} skipped**\n")?;
    Ok(())
}

fn format_duration(duration: Duration) -> String {
    if duration < Duration::from_secs(1) {
        format!("{}ms", duration.as_millis())
    } else {
        format!("{:.1}s", duration.as_secs_f64())
    }
}
