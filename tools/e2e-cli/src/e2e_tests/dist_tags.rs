use super::prelude::*;

pub(crate) fn test_dist_tags(ctx: &mut TestContext<'_>) -> Result<()> {
    let pkg1 = format!("@foo/dt1-{}", ctx.run_id);
    let tf1 = prepare_project(ctx, &pkg1, "1.0.0", BTreeMap::new(), BTreeMap::new())?;
    publish_pkg(ctx, &tf1)?;
    bump_version(ctx, &tf1, "minor")?;
    publish_pkg_extra(ctx, &tf1, vec!["--tag".into(), "beta".into()])?;
    let mut args = vec!["dist-tag".into(), "ls".into(), "--json".into()];
    args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
    let resp = exec_adapter(ctx, Some(&tf1), args)?;
    assert_eq_str(
        &normalize_dist_tag_list(&resp.stdout),
        "beta: 1.1.0\nlatest: 1.0.0",
    )?;

    let pkg2 = format!("@verdaccio/dt2-{}", ctx.run_id);
    let tf2 = prepare_project(ctx, &pkg2, "1.0.0", BTreeMap::new(), BTreeMap::new())?;
    publish_pkg(ctx, &tf2)?;
    bump_version(ctx, &tf2, "minor")?;
    publish_pkg_extra(ctx, &tf2, vec!["--tag".into(), "beta".into()])?;
    let mut args = vec![
        "dist-tag".into(),
        "rm".into(),
        format!("{pkg2}@1.1.0"),
        "beta".into(),
    ];
    args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
    let resp = exec_adapter(ctx, Some(&tf2), args)?;
    assert_eq_str(resp.stdout.trim(), &format!("-beta: {pkg2}@1.1.0"))?;

    let pkg3 = format!("@verdaccio/dt3-{}", ctx.run_id);
    let tf3 = prepare_project(ctx, &pkg3, "1.0.0", BTreeMap::new(), BTreeMap::new())?;
    publish_pkg(ctx, &tf3)?;
    bump_version(ctx, &tf3, "minor")?;
    publish_pkg(ctx, &tf3)?;
    let mut args = vec![
        "dist-tag".into(),
        "add".into(),
        format!("{pkg3}@1.1.0"),
        "alfa".into(),
    ];
    args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
    let resp = exec_adapter(ctx, Some(&tf3), args)?;
    assert_eq_str(resp.stdout.trim(), &format!("+alfa: {pkg3}@1.1.0"))?;
    Ok(())
}

fn normalize_dist_tag_list(output: &str) -> String {
    output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}
