# nix-openclaw-defender

> **Pre-alpha** – This flake is experimental and has not been build-tested yet. APIs, module options, and default values may change without notice.

Nix flake for [openclaw-defender](https://github.com/nyosegawa/openclaw-defender) – prompt injection detection servers for NixOS.

Packages the Layer 2 inference servers (Prompt Guard 2, DeBERTa v3) as native NixOS services. No Docker required.

---

## Quick Start

Add to your `flake.nix`:

```nix
{
  inputs.nix-openclaw-defender = {
    url = "github:ryoooo/nix-openclaw-defender";
    inputs.nixpkgs.follows = "nixpkgs";
  };
}
```

Import the module and enable the service:

```nix
{ nix-openclaw-defender, ... }: {
  imports = [ nix-openclaw-defender.nixosModules.default ];

  services.openclaw-defender.prompt-guard = {
    enable = true;
    device = "cpu";
  };
}
```

The server listens on `127.0.0.1:8000` and exposes `/classify` and `/health` endpoints.

## Module Options

### `services.openclaw-defender.prompt-guard`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enable` | bool | `false` | Enable the Prompt Guard 2 server |
| `port` | port | `8000` | Listen port |
| `modelSize` | `"86m"` \| `"22m"` | `"86m"` | Model variant |
| `device` | `"cpu"` \| `"cuda"` \| `"auto"` | `"cpu"` | Compute device |
| `modelCacheDir` | string | `/var/lib/openclaw-defender/prompt-guard` | HuggingFace model cache |
| `hfTokenFile` | path \| null | `null` | HuggingFace token file (for gated models) |

### `services.openclaw-defender.deberta`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enable` | bool | `false` | Enable the DeBERTa v3 server |
| `port` | port | `8001` | Listen port |
| `device` | `"cpu"` \| `"cuda"` \| `"auto"` | `"cpu"` | Compute device |
| `modelCacheDir` | string | `/var/lib/openclaw-defender/deberta` | HuggingFace model cache |

## microVM Usage

In a microVM where `/var/lib` is ephemeral, point the model cache to persistent storage to avoid re-downloading on every boot:

```nix
services.openclaw-defender.prompt-guard = {
  enable = true;
  modelCacheDir = "/persist/openclaw-defender/prompt-guard";
};
```

## Packages

Available as standalone packages:

```bash
nix run github:ryoooo/nix-openclaw-defender#prompt-guard-server
nix run github:ryoooo/nix-openclaw-defender#deberta-server
```

## Upstream

This is a Nix packaging fork of [nyosegawa/openclaw-defender](https://github.com/nyosegawa/openclaw-defender). See the upstream repository for documentation on the 3-layer defence pipeline (Layer 1 regex rules, Layer 2 ML classifiers, Layer 3 LLM judgment).

## License

MIT (same as upstream)
