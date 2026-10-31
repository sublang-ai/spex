# Coordinated Windows storage snapshot

The archive is an unpublished local build of `@sublang/playbook` 18.1.0 with the adjacent Windows storage patch. Its package version remains the upstream version; its file dependency and SHA-256 identify this snapshot. It is not the registry release of those bytes.

This temporary vendored dependency keeps SPEX source builds reproducible before the shared dependency has a coordinated release. Replace the file dependency with that release only after it contains these changes and Windows acceptance passes. No registry publication is performed by the build.

`provenance.json` records the upstream commit and archive/patch digests. To reproduce, check out that commit in the Playbook repository, apply `windows-storage.patch`, install its dependencies, run its build, and run `npm pack --ignore-scripts`. The published JavaScript changes in that archive have been compared with the patched source. The patch includes the native Windows integration test and decision record.

The upstream package license and notices remain inside the archive.
