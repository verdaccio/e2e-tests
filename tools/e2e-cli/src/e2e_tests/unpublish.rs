use super::prelude::*;

pub(crate) fn test_unpublish(ctx: &mut TestContext<'_>) -> Result<()> {
    let pkg = format!("@verdaccio/unpub1-{}", ctx.run_id);
    let temp = prepare_project(ctx, &pkg, "1.0.0", BTreeMap::new(), BTreeMap::new())?;
    for bump in ["minor", "minor", "major"] {
        publish_pkg(ctx, &temp)?;
        bump_version(ctx, &temp, bump)?;
    }
    publish_pkg(ctx, &temp)?;
    let mut args = vec![
        "unpublish".into(),
        pkg.clone(),
        "--force".into(),
        "--loglevel=info".into(),
        "--json".into(),
    ];
    args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
    let resp = exec_adapter(ctx, Some(&temp), args)?;
    assert_contains(&resp.stdout, &pkg)?;

    let pkg2 = format!("@verdaccio/unpub2-{}", ctx.run_id);
    let temp2 = prepare_project(ctx, &pkg2, "1.0.0", BTreeMap::new(), BTreeMap::new())?;
    publish_pkg(ctx, &temp2)?;
    bump_version(ctx, &temp2, "minor")?;
    publish_pkg(ctx, &temp2)?;
    let mut args = vec![
        "unpublish".into(),
        format!("{pkg2}@1.0.0"),
        "--force".into(),
        "--loglevel=info".into(),
        "--json".into(),
    ];
    args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
    let resp = exec_adapter(ctx, Some(&temp2), args)?;
    assert_contains(&resp.stdout, &pkg2)
}
