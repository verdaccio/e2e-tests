use super::prelude::*;

pub(crate) fn test_deprecate(ctx: &mut TestContext<'_>) -> Result<()> {
    sub_test(ctx, "deprecate single version", |ctx| {
        let pkg = format!("@verdaccio/dep1-{}", ctx.run_id);
        let temp = prepare_deprecate_project(ctx, &pkg, "1.0.0")?;
        publish_pkg(ctx, &temp)?;
        deprecate_pkg(ctx, &temp, &format!("{pkg}@1.0.0"), "some message")?;
        let info = info_pkg(ctx, &temp, &pkg)?;
        assert_eq_json(info.get("name"), pkg.as_str(), "Package name mismatch")?;
        assert_eq_json(
            info.get("deprecated"),
            "some message",
            "Package should be deprecated",
        )?;
        Ok(())
    })?;
    sub_test(ctx, "un-deprecate", |ctx| {
        let pkg = format!("@verdaccio/dep2-{}", ctx.run_id);
        let temp = prepare_deprecate_project(ctx, &pkg, "1.0.0")?;
        publish_pkg(ctx, &temp)?;
        deprecate_pkg(ctx, &temp, &format!("{pkg}@1.0.0"), "some message")?;
        let info = info_pkg(ctx, &temp, &pkg)?;
        assert_eq_json(
            info.get("deprecated"),
            "some message",
            "Package should be deprecated",
        )?;
        deprecate_pkg(ctx, &temp, &format!("{pkg}@1.0.0"), "")?;
        let info = info_pkg(ctx, &temp, &pkg)?;
        assert_true(
            info.get("deprecated").is_none(),
            "Package should be un-deprecated",
        )?;
        Ok(())
    })?;
    sub_test(ctx, "deprecate multiple versions", |ctx| {
        let pkg = format!("@verdaccio/dep3-{}", ctx.run_id);
        let temp = prepare_deprecate_project(ctx, &pkg, "1.0.0")?;
        publish_pkg(ctx, &temp)?;
        for _ in 0..3 {
            bump_version(ctx, &temp, "minor")?;
            publish_pkg(ctx, &temp)?;
        }
        deprecate_pkg(ctx, &temp, &pkg, "some message")?;
        for version in ["1.0.0", "1.1.0", "1.2.0", "1.3.0"] {
            let info = info_pkg(ctx, &temp, &format!("{pkg}@{version}"))?;
            assert_eq_json(
                info.get("deprecated"),
                "some message",
                "Version should be deprecated",
            )?;
        }
        bump_version(ctx, &temp, "minor")?;
        publish_pkg(ctx, &temp)?;
        let info = info_pkg(ctx, &temp, &format!("{pkg}@1.4.0"))?;
        assert_true(
            info.get("deprecated").is_none(),
            "New version should not be deprecated",
        )?;
        Ok(())
    })?;
    Ok(())
}
