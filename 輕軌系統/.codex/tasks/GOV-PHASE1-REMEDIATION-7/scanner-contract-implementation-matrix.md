# Scanner Contract Implementation Matrix

| Contract input | Production consumer | Production oracle |
|---|---|---|
| finding registry | report validator and scanner pipeline | registered-class positives, safe-negatives, and unregistered-class rejection |
| canonicalization config | scanner pipeline | raw, escaped, URL-encoded, quoted-header, and entropy differential cases |
| binary oracle | binary scanner | NUL, UTF-8, ratio, and nine magic positive/safe-negative pairs |
| contract matrix | bundle loader | exact required family, class, and magic coverage checks |
| scan contract | report generator, report validator, candidate generator, Task validator | version/hash/claim/file-set/payload rejection cases |

The production case manifest contains 72 exact cases. The bundle loader rejects missing positive or safe-negative matrix coverage.
