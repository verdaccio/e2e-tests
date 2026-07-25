use super::prelude::*;

pub(crate) fn test_search(ctx: &mut TestContext<'_>) -> Result<()> {
    let mut args = vec!["search".into(), "@verdaccio/cli".into(), "--json".into()];
    args.extend(registry_arg(&ctx.adapter, &ctx.registry_url));
    let resp = exec_adapter(ctx, None, args)?;
    let parsed: Value = serde_json::from_str(&resp.stdout)?;
    let found = parsed
        .as_array()
        .unwrap_or(&Vec::new())
        .iter()
        .any(|item| item.get("name").and_then(Value::as_str) == Some("@verdaccio/cli"));
    assert_true(found, "Expected to find @verdaccio/cli in search results")
}
