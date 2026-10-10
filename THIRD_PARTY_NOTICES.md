# Third-party notices

The root [MIT license](LICENSE) covers FitQuest's project-authored code and documentation under the owner's selected license. It does not replace copyright or license notices belonging to other authors.

- [mobile/LICENSE](mobile/LICENSE) retains the existing MIT notice for **650 Industries, Inc. (Expo), 2015–present**, unchanged from the imported mobile foundation.
- [mobile/assets/icons/LICENSE](mobile/assets/icons/LICENSE) retains Lucide Icons and Contributors’ ISC license and the Feather-derived MIT notice for the locally bundled `lucide-static@1.55.0` artwork. Original SVGs and density-specific PNG exports are under `mobile/assets/icons`; the package is not a runtime dependency.
- Installed dependencies retain their own package licenses and notices. The root, backend, database and mobile lockfiles identify the dependency versions; consult the distributed packages when redistributing them. This short index is not a replacement for those notices or an exhaustive dependency-license audit.
- The backend's public Supabase CA certificate is trust material, not a project credential or FitQuest-authored work. Preserve its provenance and verified TLS use described in [API setup](backend/README.md).

Do not remove third-party notices or relabel them as FitQuest copyright when copying, packaging or distributing the application.
