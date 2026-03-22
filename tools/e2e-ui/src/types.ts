export type RegistryConfig = {
  registryUrl: string;
  port: number;
  credentials: {
    user: string;
    password: string;
  };
  title: string;
};

export type VerdaccioUiOptions = {
  registryUrl: string;
  port?: number;
  credentials?: {
    user: string;
    password: string;
  };
  title?: string;
};
