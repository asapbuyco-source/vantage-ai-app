# Security Exceptions

This document lists known security vulnerabilities that remain after attempted remediation, along with rationale for acceptance.

## Review Date: 2026-06-05

---

## 1. protobufjs (CRITICAL)

**Package:** `protobufjs`
**Severity:** Critical
**Affected Versions:** <=7.5.7
**Current Version:** 7.5.4 (transitive dependency)
**Path:** @google/genai → protobufjs, firebase-admin → @google-cloud/firestore → google-gax → protobufjs

**Reason Accepted:** This is a transitive dependency of `firebase-admin@13.7.0` and `@google/genai@1.43.0`. Upgrading to protobufjs 8.x would break these packages which are core to the application's functionality (Firebase backend and Gemini AI integration). No safe migration path exists without breaking production functionality.

**Mitigation:**
- protobufjs is only used server-side in Node.js context
- Attack surface is limited to server-side JSON parsing of potentially untrusted protobuf data
- No direct user input reaches protobufjs serialization

**Review Date:** 2026-07-05
**Owner:** Engineering

---

## 2. path-to-regexp (HIGH)

**Package:** `path-to-regexp`
**Severity:** High
**Affected Versions:** 8.0.0 - 8.3.0
**Current Version:** 8.3.0 (transitive dependency)
**Path:** express → path-to-regexp

**Reason Accepted:** Upgrading express to a version that uses a patched path-to-regexp would constitute a major version bump with potential breaking changes to the Express.js API used throughout the backend.

**Mitigation:**
- Only affects Express routing layer
- No direct user input is used in path matching without validation
- The vulnerability requires specific crafted URL patterns

**Review Date:** 2026-07-05
**Owner:** Engineering

---

## 3. ip-address (MODERATE)

**Package:** `ip-address`
**Severity:** Moderate
**Affected Versions:** <=10.1.0
**Path:** express-rate-limit → ip-address

**Reason Accepted:** Transitive dependency of `express-rate-limit@8.x`. The rate limiter IP detection issue only affects servers with dual-stack networking in specific configurations.

**Mitigation:**
- Only affects rate limiting logic
- Other security layers remain in place
- Dual-stack servers are relatively uncommon for this deployment target

**Review Date:** 2026-07-05
**Owner:** Engineering

---

## 4. lodash (HIGH)

**Package:** `lodash`
**Severity:** High
**Affected Versions:** <=4.17.23
**Path:** Various transitive dependencies

**Reason Accepted:** Lodash vulnerabilities (prototype pollution and code injection) require specific API misuse patterns that do not occur in this codebase. The uses of lodash are all indirect through other libraries.

**Mitigation:**
- Direct usage of dangerous lodash APIs (`_.template` with user-controlled input) does not occur
- Libraries using lodash are themselves indirect dependencies
- No untrusted user input reaches lodash methods directly

**Review Date:** 2026-07-05
**Owner:** Engineering

---

## 5. picomatch (HIGH)

**Package:** `picomatch`
**Severity:** High
**Affected Versions:** <=2.3.1, 4.0.0 - 4.0.3
**Path:** workbox-build → picomatch (dev-only)

**Reason Accepted:** This is a dev-only dependency used by `workbox-build` for PWA service worker generation. The ReDoS vulnerability in picomatch's extglob quantifiers would only be triggered during the build process with specially crafted glob patterns.

**Mitigation:**
- Dev-only dependency - not present in production bundle
- Build process is controlled and does not process untrusted glob patterns
- Production deployments use pre-built assets

**Review Date:** 2026-07-05
**Owner:** Engineering

---

## Notes

- All vulnerabilities marked as "fix available via `npm audit fix`" that were not fixed either required breaking changes or introduced other incompatibilities.
- The critical `sanitize-html` vulnerability was remediated by updating to the latest version.
- The critical `protobufjs` vulnerability cannot be remediated without breaking `firebase-admin` and `@google/genai` which are core dependencies.
- Dependencies marked as dev-only (like picomatch via workbox-build) have reduced risk since they don't ship to production.