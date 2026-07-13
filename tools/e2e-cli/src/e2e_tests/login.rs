use super::prelude::*;

pub(crate) fn test_login(ctx: &mut TestContext<'_>) -> Result<()> {
    if ctx.adapter.kind != AdapterType::YarnModern {
        return Ok(());
    }
    let user1 = format!("login-a-{}", ctx.run_id);
    let password1 = "test-password-123";
    let email1 = format!("{user1}@test.example.com");
    sub_test(ctx, "create new user + whoami", |ctx| {
        let tf = prepare_login_project(ctx, &format!("verdaccio-login1-{}", ctx.run_id))?;
        let login = yarn_login(ctx, &tf, &user1, password1, &email1)?;
        assert_true(
            login.stdout.contains("Logged in") || login.stdout.contains("token saved"),
            "Expected login success message",
        )?;
        assert_contains(&yarn_whoami(ctx, &tf)?, &user1)
    })?;
    sub_test(ctx, "login existing user", |ctx| {
        let tf = prepare_login_project(ctx, &format!("verdaccio-login2-{}", ctx.run_id))?;
        let login = yarn_login(ctx, &tf, &user1, password1, &email1)?;
        assert_true(
            login.stdout.contains("Logged in") || login.stdout.contains("token saved"),
            "Expected login success message",
        )?;
        assert_contains(&yarn_whoami(ctx, &tf)?, &user1)
    })?;
    sub_test(ctx, "wrong password fails", |ctx| {
        let tf = prepare_login_project(ctx, &format!("verdaccio-login3-{}", ctx.run_id))?;
        let failed = yarn_login(ctx, &tf, &user1, "wrong-password", &email1).is_err();
        assert_true(failed, "Login with wrong password should have failed")
    })?;
    sub_test(ctx, "login then publish", |ctx| {
        let pkg = format!("@verdaccio/login-pub-{}", ctx.run_id);
        let tf = create_temp_dir(ctx.state, &format!("login-pub-{}", ctx.run_id))?
            .path()
            .to_path_buf();
        fs::write(
            tf.join(".yarnrc.yml"),
            yarn_config(&ctx.registry_url, None, ctx.adapter.yarn_major)?,
        )?;
        fs::write(
            tf.join("package.json"),
            package_json(&pkg, "1.0.0", BTreeMap::new(), BTreeMap::new())?,
        )?;
        fs::write(tf.join("README.md"), readme(&pkg))?;
        import_plugin(ctx, &tf, "npm-login")?;
        yarn_login(ctx, &tf, &user1, password1, &email1)?;
        exec_adapter(ctx, Some(&tf), vec!["install".into()])?;
        let published = exec_adapter(ctx, Some(&tf), vec!["publish".into()])?;
        assert_contains(&published.stdout, "Package archive published")
    })?;
    sub_test(ctx, "switch users", |ctx| {
        let user2 = format!("login-b-{}", ctx.run_id);
        let password2 = "other-password-456";
        let email2 = format!("{user2}@test.example.com");
        let tf = prepare_login_project(ctx, &format!("verdaccio-login5-{}", ctx.run_id))?;
        yarn_login(ctx, &tf, &user1, password1, &email1)?;
        assert_contains(&yarn_whoami(ctx, &tf)?, &user1)?;
        yarn_login(ctx, &tf, &user2, password2, &email2)?;
        assert_contains(&yarn_whoami(ctx, &tf)?, &user2)
    })?;
    Ok(())
}
