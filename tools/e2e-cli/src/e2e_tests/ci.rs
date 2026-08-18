use super::prelude::*;

pub(crate) fn test_ci(ctx: &mut TestContext<'_>) -> Result<()> {
    if ctx.adapter.kind == AdapterType::Deno {
        return Ok(());
    }
    let mut deps = BTreeMap::new();
    deps.insert("is-odd".into(), "1.0.0".into());
    let temp = prepare_project(
        ctx,
        &format!("ci-test-{}", ctx.run_id),
        "1.0.0",
        deps,
        BTreeMap::new(),
    )?;
    let mut install = vec!["install".into()];
    install.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
    exec_adapter(ctx, Some(&temp), install)?;
    let _ = fs::remove_dir_all(temp.join("node_modules"));
    let _ = fs::remove_dir_all(temp.join(".pnpm-store"));
    let mut args = match ctx.adapter.kind {
        AdapterType::Npm => vec!["ci".into()],
        AdapterType::Pnpm | AdapterType::YarnClassic | AdapterType::Bun => {
            vec!["install".into(), "--frozen-lockfile".into()]
        }
        AdapterType::YarnModern => vec!["install".into(), "--immutable".into()],
        AdapterType::Deno => vec!["ci".into()],
    };
    args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
    exec_adapter(ctx, Some(&temp), args)?;
    Ok(())
}
