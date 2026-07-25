use super::prelude::*;

pub(crate) fn test_info(ctx: &mut TestContext<'_>) -> Result<()> {
    let dir = create_temp_dir(ctx.state, "info-test")?
        .path()
        .to_path_buf();
    fs::write(
        dir.join("package.json"),
        r#"{"name":"info-test","version":"1.0.0"}"#,
    )?;
    let mut args = vec!["info".into(), "verdaccio".into(), "--json".into()];
    args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
    let resp = exec_adapter(ctx, Some(&dir), args)?;
    match ctx.adapter.kind {
        AdapterType::YarnClassic => {
            let found = resp.stdout.lines().any(|line| {
                serde_json::from_str::<Value>(line)
                    .ok()
                    .and_then(|v| v.get("type").cloned())
                    .and_then(|v| v.as_str().map(|s| s == "inspect"))
                    .unwrap_or(false)
            });
            assert_true(
                found,
                "Expected yarn info NDJSON to contain an inspect entry",
            )?;
        }
        AdapterType::Deno => assert_contains(&(resp.stdout + &resp.stderr), "verdaccio")?,
        _ => {
            let parsed = parse_info_json(&resp.stdout)?;
            assert_eq_json(
                parsed.get("name"),
                "verdaccio",
                "Expected package name verdaccio",
            )?;
            assert_true(
                parsed.get("dependencies").is_some(),
                "Expected dependencies to be defined",
            )?;
        }
    }
    Ok(())
}
