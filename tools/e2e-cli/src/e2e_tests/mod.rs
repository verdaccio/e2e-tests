pub(crate) mod audit;
pub(crate) mod ci;
pub(crate) mod deprecate;
pub(crate) mod dist_tags;
pub(crate) mod info;
pub(crate) mod install;
pub(crate) mod login;
pub(crate) mod ping;
pub(crate) mod publish;
pub(crate) mod search;
pub(crate) mod unpublish;

pub(crate) mod prelude {
    pub(crate) use anyhow::Result;
    pub(crate) use reqwest::blocking::Client;
    pub(crate) use serde_json::Value;
    pub(crate) use std::collections::BTreeMap;
    pub(crate) use std::fs;

    pub(crate) use crate::*;
}

pub(crate) fn all_tests() -> Vec<crate::TestDefinition> {
    vec![
        crate::TestDefinition {
            name: "publish",
            requires: &["publish"],
            applies_to: |_| true,
            run: publish::test_publish,
        },
        crate::TestDefinition {
            name: "install",
            requires: &["install"],
            applies_to: |_| true,
            run: install::test_install,
        },
        crate::TestDefinition {
            name: "ci",
            requires: &["install"],
            applies_to: |_| true,
            run: ci::test_ci,
        },
        crate::TestDefinition {
            name: "audit",
            requires: &["audit"],
            applies_to: |_| true,
            run: audit::test_audit,
        },
        crate::TestDefinition {
            name: "info",
            requires: &["info"],
            applies_to: |_| true,
            run: info::test_info,
        },
        crate::TestDefinition {
            name: "deprecate",
            requires: &["deprecate"],
            applies_to: |_| true,
            run: deprecate::test_deprecate,
        },
        crate::TestDefinition {
            name: "dist-tags",
            requires: &["dist-tag"],
            applies_to: |_| true,
            run: dist_tags::test_dist_tags,
        },
        crate::TestDefinition {
            name: "login",
            requires: &["login"],
            applies_to: |_| true,
            run: login::test_login,
        },
        crate::TestDefinition {
            name: "ping",
            requires: &["ping"],
            applies_to: |_| true,
            run: ping::test_ping,
        },
        crate::TestDefinition {
            name: "search",
            requires: &["search"],
            applies_to: |_| true,
            run: search::test_search,
        },
        crate::TestDefinition {
            name: "unpublish",
            requires: &["unpublish"],
            applies_to: |_| true,
            run: unpublish::test_unpublish,
        },
        crate::TestDefinition {
            name: "scenario:install-multiple-deps",
            requires: &["publish", "install", "info"],
            applies_to: |_| true,
            run: crate::scenarios::install_multiple_deps::scenario_install_multiple_deps,
        },
        crate::TestDefinition {
            name: "scenario:minimum-release-age",
            requires: &["publish", "install"],
            applies_to: crate::is_pnpm_minimum_release_age_capable,
            run: crate::scenarios::minimum_release_age::scenario_minimum_release_age,
        },
    ]
}
