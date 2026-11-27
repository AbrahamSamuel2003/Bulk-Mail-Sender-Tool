import time
import dns.exception
import dns.resolver

_DNS_CACHE: dict[str, tuple[bool, str, float]] = {}
_CACHE_TTL_SEC = 300.0  # 5 minutes


def verify_email_domain_dns(email: str) -> tuple[bool, str]:
    """
    Verify that the recipient email domain has valid MX (or fallback A) DNS records.
    Returns (is_valid, detail_message).
    """
    if "@" not in email:
        return False, "Invalid email address (missing @)"

    domain = email.rsplit("@", 1)[1].strip().lower()
    if not domain or "." not in domain:
        return False, f"Invalid email domain: {domain or '(empty)'}"

    now = time.monotonic()
    cached = _DNS_CACHE.get(domain)
    if cached and (now - cached[2]) < _CACHE_TTL_SEC:
        return cached[0], cached[1]

    resolver = dns.resolver.Resolver(configure=True)
    resolver.timeout = 5.0
    resolver.lifetime = 5.0

    try:
        mx_records = resolver.resolve(domain, "MX")
        hosts = [str(r.exchange).rstrip(".") for r in mx_records if str(r.exchange).strip(".")]
        if hosts:
            msg = f"Valid MX ({hosts[0]})"
            _DNS_CACHE[domain] = (True, msg, now)
            return True, msg
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.resolver.NoNameservers, dns.exception.Timeout) as exc:
        if isinstance(exc, dns.resolver.NXDOMAIN):
            msg = f"DNS check failed: domain '{domain}' does not exist (NXDOMAIN)"
            _DNS_CACHE[domain] = (False, msg, now)
            return False, msg
        if isinstance(exc, dns.exception.Timeout):
            msg = f"DNS check failed: DNS lookup timed out for '{domain}'"
            _DNS_CACHE[domain] = (False, msg, now)
            return False, msg
    except Exception as exc:
        msg = f"DNS check failed for '{domain}': {exc}"
        _DNS_CACHE[domain] = (False, msg, now)
        return False, msg

    # Fallback: RFC 5321 allows A record if no MX record exists
    try:
        a_records = resolver.resolve(domain, "A")
        if len(a_records) > 0:
            msg = f"Valid A record fallback for '{domain}'"
            _DNS_CACHE[domain] = (True, msg, now)
            return True, msg
    except Exception:
        pass

    msg = f"DNS check failed: no MX or A mail server records found for '{domain}'"
    _DNS_CACHE[domain] = (False, msg, now)
    return False, msg

