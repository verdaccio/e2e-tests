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
                    let expected_id = format!("{pkg_name}@1.0.0");
                    let published_name = parsed.get("name").and_then(Value::as_str);
                    let published_id = parsed.get("id").and_then(Value::as_str);
                    if published_name.is_some() || published_id.is_some() {
                        assert_true(
                            published_name == Some(pkg_name.as_str())
                                || published_id == Some(expected_id.as_str()),
                            &format!(
                                "Expected package name \"{pkg_name}\" or id \"{expected_id}\""
                            ),
                        )?;
                    }
                }
            }
        }
        assert_published(ctx, &pkg_name)?;
    }
    Ok(())
}

fn assert_published(ctx: &TestContext<'_>, pkg_name: &str) -> Result<()> {
    let encoded = pkg_name.replace('/', "%2F");
    let response = Client::new()
        .get(format!(
            "{}/{}",
            ctx.registry_url.trim_end_matches('/'),
            encoded
        ))
        .bearer_auth(&ctx.token)
        .send()
        .with_context(|| format!("failed to fetch published package {pkg_name}"))?;
    let status = response.status();
    let body: Value = response.json().unwrap_or(Value::Null);
    assert_true(
        status.is_success(),
        &format!("Expected published package {pkg_name}, got {status} {body}"),
    )?;
    assert_eq_json(
        body.get("name"),
        pkg_name,
        "Expected published registry package name",
    )
}
