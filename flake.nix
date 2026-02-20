{
  description = "Nix flake for openclaw-defender – prompt injection detection servers for NixOS";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";

  outputs = { self, nixpkgs }: let
    eachSystem = nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" ];
  in {

    packages = eachSystem (system: let
      pkgs = nixpkgs.legacyPackages.${system};
      py = pkgs.python3.withPackages (ps: with ps; [
        fastapi uvicorn pydantic transformers torch
      ]);
    in {
      prompt-guard-server = pkgs.writeShellScriptBin "prompt-guard-server" ''
        exec ${py}/bin/python ${self}/serve/prompt-guard/server.py
      '';
      deberta-server = pkgs.writeShellScriptBin "deberta-server" ''
        exec ${py}/bin/python ${self}/serve/deberta/server.py
      '';
      default = self.packages.${system}.prompt-guard-server;
    });

    nixosModules.prompt-guard = { config, lib, pkgs, ... }: let
      cfg = config.services.openclaw-defender.prompt-guard;
    in {
      options.services.openclaw-defender.prompt-guard = {
        enable = lib.mkEnableOption "Prompt Guard 2 inference server";
        port = lib.mkOption {
          type = lib.types.port;
          default = 8000;
          description = "Port to listen on.";
        };
        modelSize = lib.mkOption {
          type = lib.types.enum [ "86m" "22m" ];
          default = "86m";
          description = "Model variant.";
        };
        device = lib.mkOption {
          type = lib.types.enum [ "auto" "cpu" "cuda" ];
          default = "cpu";
          description = "Compute device.";
        };
        modelCacheDir = lib.mkOption {
          type = lib.types.str;
          default = "/var/lib/openclaw-defender/prompt-guard";
          description = "HuggingFace model cache directory. Set to persistent storage in microVMs.";
        };
        hfTokenFile = lib.mkOption {
          type = lib.types.nullOr lib.types.str;
          default = null;
          description = "Path to file containing HuggingFace API token (for gated models).";
        };
      };

      config = lib.mkIf cfg.enable {
        systemd.tmpfiles.rules = [
          "d ${cfg.modelCacheDir} 0755 root root -"
        ];
        systemd.services.prompt-guard = {
          description = "Prompt Guard 2 classifier (openclaw-defender)";
          after = [ "network-online.target" ];
          wants = [ "network-online.target" ];
          wantedBy = [ "multi-user.target" ];
          environment = {
            HOST = "127.0.0.1";
            PORT = toString cfg.port;
            MODEL_SIZE = cfg.modelSize;
            DEVICE = cfg.device;
            HF_HOME = cfg.modelCacheDir;
          };
          script = ''
            ${lib.optionalString (cfg.hfTokenFile != null) ''
              export HF_TOKEN="$(cat ${cfg.hfTokenFile})"
            ''}
            exec ${self.packages.${pkgs.system}.prompt-guard-server}/bin/prompt-guard-server
          '';
          serviceConfig = {
            Restart = "on-failure";
            RestartSec = 15;
          };
        };
      };
    };

    nixosModules.deberta = { config, lib, pkgs, ... }: let
      cfg = config.services.openclaw-defender.deberta;
    in {
      options.services.openclaw-defender.deberta = {
        enable = lib.mkEnableOption "DeBERTa v3 prompt injection server";
        port = lib.mkOption {
          type = lib.types.port;
          default = 8001;
          description = "Port to listen on.";
        };
        device = lib.mkOption {
          type = lib.types.enum [ "auto" "cpu" "cuda" ];
          default = "cpu";
          description = "Compute device.";
        };
        modelCacheDir = lib.mkOption {
          type = lib.types.str;
          default = "/var/lib/openclaw-defender/deberta";
          description = "HuggingFace model cache directory. Set to persistent storage in microVMs.";
        };
      };

      config = lib.mkIf cfg.enable {
        systemd.tmpfiles.rules = [
          "d ${cfg.modelCacheDir} 0755 root root -"
        ];
        systemd.services.deberta = {
          description = "DeBERTa v3 prompt injection classifier (openclaw-defender)";
          after = [ "network-online.target" ];
          wants = [ "network-online.target" ];
          wantedBy = [ "multi-user.target" ];
          environment = {
            HOST = "127.0.0.1";
            PORT = toString cfg.port;
            DEVICE = cfg.device;
            HF_HOME = cfg.modelCacheDir;
          };
          serviceConfig = {
            ExecStart = "${self.packages.${pkgs.system}.deberta-server}/bin/deberta-server";
            Restart = "on-failure";
            RestartSec = 15;
          };
        };
      };
    };

    nixosModules.default = {
      imports = [
        self.nixosModules.prompt-guard
        self.nixosModules.deberta
      ];
    };
  };
}
