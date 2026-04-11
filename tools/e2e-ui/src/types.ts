import type {
  PublishPackageResult,
  PublishPackageTaskInput,
  UnpublishPackageInput,
  UnpublishPackageResult,
} from './tasks';
import type { DeepPartial, Selectors, TestIds } from './testIds';

export type RegistryConfig = {
  registryUrl: string;
  port: number;
  credentials: {
    user: string;
    password: string;
  };
  title: string;
  /** Fully-resolved data-testid map (defaults merged with overrides). */
  testIds: TestIds;
  /** Fully-resolved CSS selector map (defaults merged with overrides). */
  selectors: Selectors;
};

export type VerdaccioUiOptions = {
  registryUrl: string;
  port?: number;
  credentials?: {
    user: string;
    password: string;
  };
  title?: string;
  /** Partial override of the default data-testid map. */
  testIds?: DeepPartial<TestIds>;
  /** Partial override of the default CSS selector map. */
  selectors?: DeepPartial<Selectors>;
};

/**
 * Return value of the `registry` Cypress task — exposed as a named
 * type so `cy.task('registry')` can be strongly typed at the call site.
 */
export interface RegistryTaskResult {
  registryUrl: string;
  port: number;
}

// ── Ambient Cypress augmentations ──────────────────────────────────
//
// This module is imported by every test file (for `RegistryConfig`) and
// by the package's main entry `index.ts` (for re-export), so the
// `declare global` block here reaches both internal tests AND external
// consumers via tsc's declaration emit.
//
// The runtime command implementations live in `./commands/index.ts`
// and the task implementations in `./index.ts`'s `setupVerdaccioTasks`.

declare global {
  namespace Cypress {
    interface Chainable<Subject = any> {
      /**
       * Find an element by its `data-testid` attribute.
       */
      getByTestId(
        selector: string,
        ...args: any[]
      ): Chainable<JQuery<HTMLElement>>;

      /**
       * Log in to the Verdaccio UI via the login dialog.
       *
       * `selectors` is optional — each field falls back to the
       * Verdaccio 6.x default selector if omitted. Pass overrides when
       * targeting a non-default Verdaccio build.
       */
      login(
        user: string,
        password: string,
        selectors?: {
          loginButton?: string;
          usernameInput?: string;
          passwordInput?: string;
          submitButton?: string;
        }
      ): Chainable<void>;

      // ── Typed overloads for the tasks registered by setupVerdaccioTasks ──
      // These must appear BEFORE Cypress's default untyped
      // `task(event: string, arg?: any): Chainable<any>` in the lookup
      // order. TypeScript checks augmented overloads first, so literal
      // string matches win.

      /**
       * Publish a throwaway package to the configured registry.
       *
       * @example
       *   cy.task('publishPackage', {
       *     pkgName: '@verdaccio/pkg-scoped',
       *     version: '1.0.0',
       *     dependencies: { debug: '4.0.0' },
       *     unique: true,
       *   }).then((result) => {
       *     // result is a PublishPackageResult — fully typed.
       *   });
       */
      task(
        event: 'publishPackage',
        arg: PublishPackageTaskInput,
        options?: Partial<Loggable & Timeoutable>
      ): Chainable<PublishPackageResult>;

      /**
       * Remove a temp project folder previously returned by
       * `cy.task('publishPackage', …)`. Refuses to delete paths outside
       * `os.tmpdir()`. Resolves with `null`.
       */
      task(
        event: 'cleanupPublished',
        arg: string,
        options?: Partial<Loggable & Timeoutable>
      ): Chainable<null>;

      /**
       * Unpublish a package from the registry so the next test starts
       * from a clean slate. Accepts either a bare package name (uses
       * the configured registry URL and mints its own throwaway token)
       * or a full input object (reuses an existing `tempFolder`'s
       * .npmrc for efficiency).
       *
       * @example
       *   cy.task('unpublishPackage', '@verdaccio/pkg-scoped');
       *   cy.task('unpublishPackage', { pkgName, tempFolder });
       */
      task(
        event: 'unpublishPackage',
        arg:
          | string
          | (Omit<UnpublishPackageInput, 'registryUrl'> & {
              registryUrl?: string;
            }),
        options?: Partial<Loggable & Timeoutable>
      ): Chainable<UnpublishPackageResult>;

      /**
       * Read back the registry URL and port that were passed to
       * `setupVerdaccioTasks`. Useful in specs that need to compute
       * URLs without importing the cypress config.
       */
      task(
        event: 'registry',
        arg?: unknown,
        options?: Partial<Loggable & Timeoutable>
      ): Chainable<RegistryTaskResult>;
    }
  }
}
