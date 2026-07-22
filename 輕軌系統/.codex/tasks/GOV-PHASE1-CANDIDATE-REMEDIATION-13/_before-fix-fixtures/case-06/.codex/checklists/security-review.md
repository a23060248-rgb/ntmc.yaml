# Security Review Checklist

- Confirm no `.env*`, secret, token, password or connection string was read or recorded.
- Check authentication, authorization, role separation, input validation and audit integrity.
- Confirm DB environment evidence allows only loopback, 5433 and rehearsal database naming.
- Confirm no formal credentials or deployment permissions were granted.
- Record residual controls that exist only as text, not mechanism.
- Do not edit product code while reviewing.
