#!/usr/bin/env python3
"""Generate deterministic test purchase data.

Produces 300 purchase records spanning the last 6 months.
Each record represents ONE purchase event — the same book can appear
multiple times with different purchase dates (sales log, not catalogue).

Fields: id, title, author, genre, country, price, pages, rating,
        status, purchase_date (ISO 8601 timestamp).

Output: tests/data/books.json and tests/data/books.csv

Usage:
    python3 tests/data/generate.py
"""

import csv
import json
import os
import random
import uuid
from datetime import datetime, timedelta, timezone

SEED = 42
random.seed(SEED)

# ── Fixed book catalog (30 titles) ────────────────────────────

CATALOG = [
    {"title": "Le Dernier Souffle",        "author": "Marie Lefebvre",   "genre": "Thriller",    "country": "France",        "pages": 324, "rating": 4.5, "price": 19.90},
    {"title": "Étoiles Perdues",           "author": "Théo Marchand",    "genre": "Sci-Fi",      "country": "Belgique",      "pages": 412, "rating": 4.2, "price": 22.50},
    {"title": "L'Énigme du Lac",           "author": "Clara Bonnet",     "genre": "Mystère",     "country": "Suisse",        "pages": 287, "rating": 3.9, "price": 17.00},
    {"title": "Mémoires d'Outre-Monde",    "author": "Julien Deschamps", "genre": "Sci-Fi",      "country": "Canada",        "pages": 531, "rating": 4.7, "price": 24.90},
    {"title": "Le Cycle des Ombres",       "author": "Sophie Renard",    "genre": "Fiction",     "country": "France",        "pages": 398, "rating": 4.1, "price": 20.00},
    {"title": "Quand Vient la Nuit",       "author": "Alexis Moreau",    "genre": "Thriller",    "country": "France",        "pages": 256, "rating": 4.4, "price": 18.50},
    {"title": "La Carte de l'Improbable", "author": "Emma Dubois",      "genre": "Fiction",     "country": "Belgique",      "pages": 344, "rating": 3.8, "price": 16.90},
    {"title": "Fragments d'Éternité",      "author": "Baptiste Laurent", "genre": "Sci-Fi",      "country": "France",        "pages": 467, "rating": 4.6, "price": 23.00},
    {"title": "La Montagne Silencieuse",   "author": "Léa Simon",        "genre": "Biographie",  "country": "Suisse",        "pages": 189, "rating": 4.0, "price": 15.50},
    {"title": "Horizons Inversés",         "author": "Antoine Blanc",    "genre": "Sci-Fi",      "country": "Canada",        "pages": 502, "rating": 4.3, "price": 21.90},
    {"title": "Le Manuscrit Oublié",       "author": "Camille Girard",   "genre": "Mystère",     "country": "France",        "pages": 318, "rating": 4.8, "price": 19.50},
    {"title": "Sous les Cendres",          "author": "Nicolas Petit",    "genre": "Thriller",    "country": "Royaume-Uni",   "pages": 275, "rating": 3.7, "price": 16.00},
    {"title": "La Voix du Silence",        "author": "Chloé Bernard",    "genre": "Romance",     "country": "France",        "pages": 231, "rating": 4.2, "price": 17.90},
    {"title": "Archipel",                  "author": "Hugo Martin",      "genre": "Fiction",     "country": "Canada",        "pages": 389, "rating": 4.0, "price": 20.50},
    {"title": "Le Temps Suspendu",         "author": "Inès Thomas",      "genre": "Biographie",  "country": "Belgique",      "pages": 214, "rating": 3.6, "price": 14.90},
    {"title": "Nuits Blanches",            "author": "Raphaël Robert",   "genre": "Romance",     "country": "France",        "pages": 263, "rating": 4.4, "price": 18.00},
    {"title": "L'Équation du Destin",      "author": "Anaïs Michel",     "genre": "Sci-Fi",      "country": "Allemagne",     "pages": 445, "rating": 4.5, "price": 22.00},
    {"title": "Les Gardiens du Vide",      "author": "Maxime Leroy",     "genre": "Sci-Fi",      "country": "France",        "pages": 518, "rating": 4.1, "price": 21.00},
    {"title": "Résonances",                "author": "Jade Roux",        "genre": "Fiction",     "country": "Suisse",        "pages": 302, "rating": 4.3, "price": 19.00},
    {"title": "La Chute des Empires",      "author": "Lucas Garcia",     "genre": "Thriller",    "country": "Royaume-Uni",   "pages": 456, "rating": 4.6, "price": 23.50},
    {"title": "Par-delà l'Horizon",        "author": "Marie Lefebvre",   "genre": "Fiction",     "country": "France",        "pages": 337, "rating": 4.0, "price": 18.90},
    {"title": "Le Miroir Brisé",           "author": "Théo Marchand",    "genre": "Mystère",     "country": "Belgique",      "pages": 291, "rating": 3.8, "price": 16.50},
    {"title": "Solstice",                  "author": "Clara Bonnet",     "genre": "Romance",     "country": "France",        "pages": 247, "rating": 4.1, "price": 17.50},
    {"title": "L'Hiver des Esprits",       "author": "Julien Deschamps", "genre": "Thriller",    "country": "Canada",        "pages": 383, "rating": 4.4, "price": 20.90},
    {"title": "Cartographie de l'Invisible","author": "Sophie Renard",   "genre": "Sci-Fi",      "country": "Allemagne",     "pages": 476, "rating": 4.2, "price": 22.90},
    {"title": "Les Marées du Temps",       "author": "Alexis Moreau",    "genre": "Fiction",     "country": "France",        "pages": 359, "rating": 4.3, "price": 19.90},
    {"title": "L'Art du Mensonge",         "author": "Emma Dubois",      "genre": "Thriller",    "country": "Royaume-Uni",   "pages": 312, "rating": 4.7, "price": 21.50},
    {"title": "Terres Grises",             "author": "Baptiste Laurent", "genre": "Biographie",  "country": "Suisse",        "pages": 198, "rating": 3.5, "price": 14.00},
    {"title": "Vertiges",                  "author": "Léa Simon",        "genre": "Romance",     "country": "France",        "pages": 278, "rating": 4.2, "price": 18.00},
    {"title": "La Prophétie d'Automne",    "author": "Antoine Blanc",    "genre": "Mystère",     "country": "Canada",        "pages": 421, "rating": 4.5, "price": 23.00},
]

# ── Generation ────────────────────────────────────────────────

NOW = datetime(2026, 3, 14, tzinfo=timezone.utc)
START = NOW - timedelta(days=180)  # 6 months back


def random_date(start: datetime, end: datetime) -> datetime:
    delta = end - start
    seconds = int(delta.total_seconds())
    return start + timedelta(seconds=random.randint(0, seconds))


def generate_purchases(n: int = 300) -> list[dict]:
    """Generate n purchase events from the catalog.

    Each book has a random popularity weight so some titles sell much
    more than others, producing realistic uneven distributions.
    """
    # Assign a random popularity weight to each book (set once, deterministic)
    weights = [random.uniform(0.3, 4.0) for _ in CATALOG]

    # Give a couple of books an extra boost (best-sellers)
    for i in [0, 3, 6, 10, 19, 26]:  # indexes of "popular" titles
        weights[i] *= 2.5

    purchases = []
    for _ in range(n):
        book = random.choices(CATALOG, weights=weights, k=1)[0]
        purchases.append({
            "id": str(uuid.UUID(int=random.getrandbits(128))),
            "title": book["title"],
            "author": book["author"],
            "genre": book["genre"],
            "country": book["country"],
            "price": book["price"],
            "pages": book["pages"],
            "rating": book["rating"],
            "status": "done",
            "purchase_date": random_date(START, NOW).strftime("%Y-%m-%dT%H:%M:%SZ"),
        })

    # Sort chronologically for nicer temporal charts
    purchases.sort(key=lambda p: p["purchase_date"])
    return purchases


def write_json(purchases: list[dict], path: str):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(purchases, f, ensure_ascii=False, indent=2)
    print(f"  JSON → {path}  ({len(purchases)} records)")


def write_csv(purchases: list[dict], path: str):
    if not purchases:
        return
    fields = list(purchases[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for p in purchases:
            writer.writerow(p)
    print(f"  CSV  → {path}  ({len(purchases)} records)")


if __name__ == "__main__":
    out_dir = os.path.dirname(__file__)
    purchases = generate_purchases(300)

    write_json(purchases, os.path.join(out_dir, "books.json"))
    write_csv(purchases, os.path.join(out_dir, "books.csv"))

    # Quick stats
    from collections import Counter
    genres = Counter(p["genre"] for p in purchases)
    title_counts = Counter(p["title"] for p in purchases)
    top5 = title_counts.most_common(5)

    print(f"\n  Stats:")
    print(f"    Total achats  : {len(purchases)}")
    print(f"    Titres uniques: {len(set(p['title'] for p in purchases))}")
    print(f"\n  Par genre:")
    for g, c in sorted(genres.items(), key=lambda x: -x[1]):
        print(f"    {g:<16} : {c}")
    print(f"\n  Top 5 titres:")
    for title, count in top5:
        print(f"    {title:<40} : {count} achats")
