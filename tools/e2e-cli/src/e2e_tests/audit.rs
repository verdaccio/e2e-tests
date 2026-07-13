use super::prelude::*;

pub(crate) fn test_audit(ctx: &mut TestContext<'_>) -> Result<()> {
    if !matches!(ctx.adapter.kind, AdapterType::Npm | AdapterType::Bun) {
        return Ok(());
    }
    for pkg_name in [
        format!("verdaccio-audit-{}", ctx.run_id),
        format!("@verdaccio/audit-{}", ctx.run_id),
    ] {
        let mut deps = BTreeMap::new();
        deps.insert("jquery".into(), "3.6.1".into());
        let temp = prepare_project(ctx, &pkg_name, "1.0.0", deps, BTreeMap::new())?;
        let mut install = vec!["install".into()];
        install.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
        exec_adapter(ctx, Some(&temp), install)?;
        let probe = Client::new()
            .post(format!(
                "{}/-/npm/v1/security/audits/quick",
                ctx.registry_url
            ))
            .header("Content-Type", "application/json")
            .body("{}")
            .send();
        match probe {
            Ok(resp) if resp.status().as_u16() == 404 => return Ok(()),
            Err(_) => return Ok(()),
            _ => {}
        }
        let mut args = vec!["audit".into(), "--json".into()];
        args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
        let resp = exec_adapter(ctx, Some(&temp), args)?;
        if ctx.adapter.kind == AdapterType::Bun {
            assert_true(
                !resp.stdout.is_empty() || !resp.stderr.is_empty(),
                "Expected audit output",
            )?;
        } else {
            let parsed: Value = serde_json::from_str(&resp.stdout)?;
            assert_true(
                parsed.get("auditReportVersion").is_some(),
                "Expected auditReportVersion",
            )?;
            assert_true(
                parsed.get("vulnerabilities").is_some(),
                "Expected vulnerabilities",
            )?;
        }
    }
    Ok(())
}
