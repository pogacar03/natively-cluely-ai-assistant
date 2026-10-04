// Public fork build. The private premium submodule is unavailable to forks.
// Keep its bundle ID and user data separate from the installed official app.
const base = require('./package.json').build;

module.exports = {
  ...base,
  productName: 'Natively Open',
  appId: 'com.pogacar03.natively.open',
  directories: { ...base.directories, output: 'release/open' },
  mac: {
    ...base.mac,
    identity: null,
    hardenedRuntime: false,
    target: [
      { target: 'zip', arch: ['arm64'] },
      { target: 'dmg', arch: ['arm64'] },
    ],
  },
};
