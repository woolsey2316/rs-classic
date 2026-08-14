{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  nativeBuildInputs = with pkgs; [
    pkg-config
    python3
    gnumake
    gcc
  ];

  buildInputs = with pkgs; [
    nodejs

    # Native libs for node-canvas (compile from source — no Node 24 prebuilds)
    cairo
    pango
    libjpeg
    libpng
    giflib
    librsvg
    pixman
    libuuid
    glib
    freetype
    fontconfig
  ];

  shellHook = ''
    # .pc files live in the Nix *dev* outputs, not the runtime lib dirs.
    export PKG_CONFIG_PATH="${pkgs.lib.makeSearchPath "lib/pkgconfig" [
      pkgs.cairo.dev
      pkgs.pango.dev
      pkgs.pixman
      pkgs.glib.dev
      pkgs.libpng.dev
      pkgs.libjpeg.dev
      pkgs.freetype.dev
      pkgs.fontconfig.dev
      pkgs.giflib
    ]}:$PKG_CONFIG_PATH"

    export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [
      pkgs.cairo
      pkgs.pango
      pkgs.libuuid
      pkgs.glib
      pkgs.libjpeg
      pkgs.libpng
      pkgs.giflib
      pkgs.pixman
      pkgs.freetype
      pkgs.fontconfig
    ]}:$LD_LIBRARY_PATH"

    # Help node-gyp / canvas find headers on Nix.
    export CXXFLAGS="''${CXXFLAGS:-} -I${pkgs.cairo.dev}/include/cairo -I${pkgs.pango.dev}/include/pango-1.0 -I${pkgs.glib.dev}/include/glib-2.0 -I${pkgs.glib.out}/lib/glib-2.0/include -I${pkgs.pixman}/include/pixman-1 -I${pkgs.freetype.dev}/include/freetype2 -I${pkgs.libpng.dev}/include"
    export CPPFLAGS="$CXXFLAGS"

    export NPM_CONFIG_PREFIX="$PWD/.npm-packages"
    export PATH="$PWD/.npm-packages/bin:$PATH"

    echo "✅ Frontend nix shell ready (Node $(node -v)) with canvas build deps"
  '';
}
