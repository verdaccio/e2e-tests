use super::prelude::*;

pub(crate) fn scenario_install_multiple_deps(ctx: &mut TestContext<'_>) -> Result<()> {
    let id = ctx.run_id.clone();
    let mut project_cwd = PathBuf::new();
    sub_test(ctx, "publish seed packages", |ctx| {
        for i in 1..=5 {
            publish_seed(
                ctx,
                &format!("@verdaccio/seed-{id}-{i}"),
                "1.0.0",
                BTreeMap::new(),
            )?;
        }
        let shared = format!("@verdaccio/seed-shared-{id}");
        publish_seed(ctx, &shared, "1.0.0", BTreeMap::new())?;
        let mut deps = BTreeMap::new();
        deps.insert(format!("@verdaccio/seed-{id}-1"), "1.0.0".into());
        deps.insert(format!("@verdaccio/seed-{id}-2"), "1.0.0".into());
        deps.insert(shared, "1.0.0".into());
        publish_seed(ctx, &format!("@verdaccio/seed-mid-{id}"), "1.0.0", deps)
    })?;
    sub_test(ctx, "install all dependencies in consumer project", |ctx| {
        let mut deps = BTreeMap::new();
        for i in 1..=5 {
            deps.insert(format!("@verdaccio/seed-{id}-{i}"), "1.0.0".into());
        }
        deps.insert(format!("@verdaccio/seed-mid-{id}"), "1.0.0".into());
        deps.insert(format!("@verdaccio/seed-shared-{id}"), "1.0.0".into());
        project_cwd = prepare_project(
            ctx,
            &format!("@verdaccio/consumer-{id}"),
            "1.0.0",
            deps,
            BTreeMap::new(),
        )?;
        let mut args = vec!["install".into()];
        args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
        exec_adapter(ctx, Some(&project_cwd), args)?;
        Ok(())
    })?;
    sub_test(ctx, "verify installed packages", |ctx| {
        for i in 1..=5 {
            let name = format!("@verdaccio/seed-{id}-{i}");
            let info = info_pkg(ctx, &project_cwd, &name)?;
            assert_eq_json(info.get("name"), name.as_str(), "Expected package name")?;
            assert_eq_json(info.get("version"), "1.0.0", "Expected version")?;
        }
        let mid = format!("@verdaccio/seed-mid-{id}");
        let info = info_pkg(ctx, &project_cwd, &mid)?;
        assert_eq_json(info.get("name"), mid.as_str(), "Expected mid package")?;
        let deps = info
            .get("dependencies")
            .and_then(Value::as_object)
            .ok_or_else(|| anyhow!("Expected dependencies"))?;
        assert_eq_json(
            deps.get(&format!("@verdaccio/seed-{id}-1")),
            "1.0.0",
            "Intermediate dependency mismatch",
        )?;
        assert_eq_json(
            deps.get(&format!("@verdaccio/seed-{id}-2")),
            "1.0.0",
            "Intermediate dependency mismatch",
        )?;
        assert_eq_json(
            deps.get(&format!("@verdaccio/seed-shared-{id}")),
            "1.0.0",
            "Intermediate dependency mismatch",
        )
    })?;
    sub_test(ctx, "update and re-install", |ctx| {
        let leaf = format!("@verdaccio/seed-{id}-1");
        let shared = format!("@verdaccio/seed-shared-{id}");
        publish_seed(ctx, &leaf, "2.0.0", BTreeMap::new())?;
        publish_seed(ctx, &shared, "2.0.0", BTreeMap::new())?;
        let mut deps = BTreeMap::new();
        deps.insert(leaf.clone(), "^1.0.0".into());
        deps.insert(shared, "^1.0.0".into());
        let temp = prepare_project(
            ctx,
            &format!("@verdaccio/consumer-update-{id}"),
            "1.0.0",
            deps,
            BTreeMap::new(),
        )?;
        let mut args = vec!["install".into()];
        args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
        exec_adapter(ctx, Some(&temp), args)?;
        let info = info_pkg(ctx, &temp, &leaf)?;
        let latest = info
            .pointer("/dist-tags/latest")
            .or_else(|| info.get("version"))
            .and_then(Value::as_str)
            .unwrap_or("");
        assert_eq_str(latest, "2.0.0")
    })?;
    Ok(())
}
