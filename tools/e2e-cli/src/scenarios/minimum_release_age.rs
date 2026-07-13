use super::prelude::*;

pub(crate) fn scenario_minimum_release_age(ctx: &mut TestContext<'_>) -> Result<()> {
    let id = ctx.run_id.clone();
    let excluded_scoped = format!("@verdaccio/release-age-{id}");
    let excluded_unscoped = format!("verdaccio-release-age-{id}");
    let blocked = format!("e2e-release-age-blocked-{id}");
    sub_test(ctx, "publish fresh packages", |ctx| {
        publish_seed(ctx, &excluded_scoped, "1.0.0", BTreeMap::new())?;
        publish_seed(ctx, &excluded_unscoped, "1.0.0", BTreeMap::new())?;
        publish_seed(ctx, &blocked, "1.0.0", BTreeMap::new())
    })?;
    sub_test(ctx, "excluded packages bypass the cooldown", |ctx| {
        let mut deps = BTreeMap::new();
        deps.insert(excluded_scoped.clone(), "1.0.0".into());
        deps.insert(excluded_unscoped.clone(), "1.0.0".into());
        let temp =
            prepare_cooldown_consumer(ctx, &format!("@verdaccio/consumer-excluded-{id}"), deps)?;
        let mut args = vec!["install".into()];
        args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
        exec_adapter(ctx, Some(&temp), args)?;
        Ok(())
    })?;
    sub_test(ctx, "non-excluded fresh package is blocked", |ctx| {
        let mut deps = BTreeMap::new();
        deps.insert(blocked.clone(), "1.0.0".into());
        let temp = prepare_cooldown_consumer(ctx, &format!("e2e-consumer-blocked-{id}"), deps)?;
        let mut args = vec!["install".into(), "--frozen-lockfile=false".into()];
        args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
        let error = exec_adapter(ctx, Some(&temp), args)
            .err()
            .map(|err| format!("{err:#}"))
            .unwrap_or_default();
        assert_true(
            !error.is_empty(),
            "Expected install of fresh non-excluded package to be blocked",
        )?;
        assert_true(
            error.to_ascii_lowercase().contains("minimumreleaseage")
                || error.contains("NO_MATURE_MATCHING_VERSION"),
            "Expected minimumReleaseAge cooldown error",
        )
    })?;
    Ok(())
}
