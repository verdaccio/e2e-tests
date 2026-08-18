use super::prelude::*;

pub(crate) fn test_install(ctx: &mut TestContext<'_>) -> Result<()> {
    let mut deps = BTreeMap::new();
    deps.insert("react".into(), "18.2.0".into());
    let temp = prepare_project(
        ctx,
        &format!("install-test-{}", ctx.run_id),
        "1.0.0",
        deps,
        BTreeMap::new(),
    )?;
    let mut args = vec!["install".into()];
    if ctx.adapter.kind == AdapterType::Npm {
        args.push("--json".into());
    }
    args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
    let resp = exec_adapter(ctx, Some(&temp), args)?;
    if ctx.adapter.kind == AdapterType::Npm {
        let parsed: Value = serde_json::from_str(&resp.stdout)?;
        assert_true(
            parsed.get("added").is_some(),
            "Expected \"added\" field in install response",
        )?;
    }
    Ok(())
}
