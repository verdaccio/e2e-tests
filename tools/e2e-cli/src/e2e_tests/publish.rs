use super::prelude::*;

pub(crate) fn test_publish(ctx: &mut TestContext<'_>) -> Result<()> {
    let packages = vec![
        format!("verdaccio-memory-{}", ctx.run_id),
        format!("verdaccio-{}", ctx.run_id),
        format!("@verdaccio/foo-{}", ctx.run_id),
        format!("@verdaccio/some-foo-{}", ctx.run_id),
    ];
    for pkg_name in packages {
        let temp = prepare_project(ctx, &pkg_name, "1.0.0", BTreeMap::new(), BTreeMap::new())?;
        if ctx.adapter.kind == AdapterType::YarnModern {
            exec_adapter(ctx, Some(&temp), vec!["install".into()])?;
        }
        let mut args = vec!["publish".into(), "--json".into()];
        args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
        let resp = exec_adapter(ctx, Some(&temp), args)?;
        match ctx.adapter.kind {
            AdapterType::YarnModern => assert_contains(&resp.stdout, "Package archive published")?,
            AdapterType::YarnClassic => {
                assert_true(!resp.stdout.is_empty(), "Expected publish output")?
            }
            AdapterType::Bun => {}
            _ => {
                if let Ok(parsed) = serde_json::from_str::<Value>(&resp.stdout) {
                    assert_eq_json(
                        parsed.get("name"),
                        pkg_name.as_str(),
                        "Expected package name",
                    )?;
                    assert_true(
                        parsed.get("files").is_some(),
                        "Expected files to be defined",
                    )?;
                }
            }
        }
    }
    Ok(())
}
