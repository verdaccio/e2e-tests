use super::prelude::*;

pub(crate) fn test_ping(ctx: &mut TestContext<'_>) -> Result<()> {
    let cwd = if ctx.adapter.kind == AdapterType::YarnModern {
        let temp = prepare_project(
            ctx,
            &format!("verdaccio-ping-{}", ctx.run_id),
            "1.0.0",
            BTreeMap::new(),
            BTreeMap::new(),
        )?;
        import_plugin(ctx, &temp, "npm-ping")?;
        Some(temp)
    } else {
        None
    };
    let mut args = vec!["ping".into()];
    if ctx.adapter.kind != AdapterType::YarnModern {
        args.push("--json".into());
    }
    args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
    let resp = exec_adapter(ctx, cwd.as_deref(), args)?;
    if ctx.adapter.kind != AdapterType::YarnModern {
        let parsed: Value = serde_json::from_str(&resp.stdout)?;
        let expected_registry = format!("{}/", ctx.registry_url);
        assert_eq_json(
            parsed.get("registry"),
            expected_registry.as_str(),
            "Registry mismatch",
        )?;
    }
    Ok(())
}
