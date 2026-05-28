from datetime import datetime, date
import math


def safe_divide(numerator, denominator, default=0.0):
    if denominator is None or denominator == 0:
        return default
    return numerator / denominator


def fmt_amount(value, decimals=2):
    if value is None:
        return "0.00"
    return f"{float(value):,.{decimals}f}"


def fmt_pct(value, decimals=2):
    if value is None:
        return "0.00%"
    return f"{float(value) * 100:.{decimals}f}%"


def fmt_int(value):
    if value is None:
        return "0"
    return f"{int(value):,}"


def parse_date(value):
    if value is None:
        return None
    if isinstance(value, (date, datetime)):
        return value
    s = str(value).strip()[:10]
    return datetime.strptime(s, "%Y-%m-%d").date()


def top_n(rows, key, n=10, reverse=True):
    return sorted(rows, key=lambda r: r.get(key, 0) or 0, reverse=reverse)[:n]


def safe_mean(values):
    if not values:
        return 0.0
    return sum(values) / len(values)


def safe_std(values):
    if len(values) < 2:
        return 0.0
    m = safe_mean(values)
    return math.sqrt(sum((v - m) ** 2 for v in values) / (len(values) - 1))


def percentile(values, p):
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * p / 100.0
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return s[int(k)]
    return s[f] * (c - k) + s[c] * (k - f)


def standardize(values):
    if not values:
        return []
    m = safe_mean(values)
    s = safe_std(values)
    if s == 0:
        return [0.0] * len(values)
    return [(v - m) / s for v in values]
