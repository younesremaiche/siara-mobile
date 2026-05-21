"""Train the SIARA report validator.

Why this script exists:
The previous report classifier (Fakeddit-trained CLIP model) was returning
``spam_score = 1.0`` (100 %) for almost every SIARA report. The reason is
domain mismatch: it was trained on multimodal Reddit fake-news examples and
saturates on out-of-distribution citizen reports about Algerian roads.

This script trains a small SIARA-specific scikit-learn classifier on a seed
dataset that covers all five labels in mixed FR/EN/AR-transliteration, the
languages SIARA users actually write in.

Usage:
    python train_report_validator.py [--output report_validator_model.joblib]

Run from this directory or anywhere - paths default to the local files.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from typing import Iterable, List, Sequence, Tuple

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

import joblib

from report_validator import (
    DEFAULT_MODEL_NAME,
    DEFAULT_MODEL_PATH,
    DEFAULT_METADATA_PATH,
    DEFAULT_MODEL_VERSION,
    DEFAULT_NEAR_ROAD_RELAXED_M,
    DEFAULT_NEAR_ROAD_STRICT_M,
    LABELS,
    build_text_input,
)


# --- Seed dataset ------------------------------------------------------------
# Every row: (title, description, incident_type, label).
# Texts mix FR, EN and AR-transliteration to match how SIARA users write.
SEED_ROWS: List[Tuple[str, str, str, str]] = [
    # --- real / road-safety reports ----------------------------------------
    ("Accident sur la rocade", "Voiture renversee a la sortie 14, circulation bloquee", "accident", "real"),
    ("Crash on highway", "Two cars collided near the airport exit, ambulance is on the way", "accident", "real"),
    ("Embouteillage important", "Bouchon sur l'autoroute est, plus de 30 minutes d'attente", "traffic", "real"),
    ("Heavy traffic jam", "Traffic jam at the city center, all lanes blocked", "traffic", "real"),
    ("Route bloquee par travaux", "Travaux en cours, route fermee jusqu'a 18h", "roadworks", "real"),
    ("Road works closed lane", "Roadworks have closed the right lane on the bridge", "roadworks", "real"),
    ("Nid de poule dangereux", "Trou enorme sur la route nationale, dangereux pour les motos", "danger", "real"),
    ("Pothole damaging cars", "Massive pothole on the main road, multiple cars damaged", "danger", "real"),
    ("Obstacle sur la voie", "Pneu eclate au milieu de la chaussee, attention", "danger", "real"),
    ("Object blocking the road", "Fallen tree blocking the road after the storm", "danger", "real"),
    ("Brouillard epais", "Visibilite reduite a cause du brouillard, soyez prudents", "weather", "real"),
    ("Heavy rain reduces visibility", "Heavy rain on the highway, reduce speed", "weather", "real"),
    ("Verglas sur la chaussee", "Plaque de verglas signalee dans le tunnel, risque eleve", "weather", "real"),
    ("Police checkpoint slowing traffic", "Police checkpoint on the boulevard, expect delays", "police", "real"),
    ("Ambulance bloquee", "Ambulance bloquee dans le bouchon, laissez passer", "emergency", "real"),
    ("Camion en panne", "Camion en panne sur la voie de droite, danger", "danger", "real"),
    ("Voiture stationnee dangereusement", "Vehicule arrete sur la voie rapide", "danger", "real"),
    ("Tariq mghloka", "Route bloquee a cause d'un accident, dawru", "accident", "real"),
    ("Bouchon enorme", "Bouchon kbir au niveau du rond-point", "traffic", "real"),
    ("Glissiere endommagee", "Glissiere de securite cassee apres l'accident", "danger", "real"),
    ("Feu tricolore en panne", "Feu rouge ne fonctionne plus, attention au croisement", "danger", "real"),
    ("Inondation route", "Route inondee apres la pluie, impraticable", "weather", "real"),
    ("Chaussee glissante", "Huile sur la route, attention aux deux roues", "danger", "real"),
    ("Manifestation bloque la route", "Manifestation pacifique bloque la route principale", "traffic", "real"),
    ("Animaux sur la route", "Troupeau de moutons traverse la route nationale", "danger", "real"),
    ("Visibility issues fog", "Dense fog reducing visibility to less than 50 meters", "weather", "real"),
    ("Rear end collision", "Three vehicles involved in a rear end collision", "accident", "real"),
    ("Traffic light malfunction", "Traffic light not working at busy junction", "danger", "real"),
    ("Lane closed for maintenance", "Maintenance crew has closed the left lane", "roadworks", "real"),
    ("Truck overturned", "Heavy truck overturned spilling its load on the road", "accident", "real"),
    ("Detour signalisation absente", "Deviation mais aucune signalisation, on se perd", "roadworks", "real"),
    ("Pluie diluvienne", "Pluie tres forte, plusieurs voitures arretees", "weather", "real"),
    ("Vent fort sur le pont", "Rafales de vent dangereuses sur le pont", "weather", "real"),
    ("Police dirige la circulation", "Agent de police regle la circulation au carrefour", "police", "real"),
    ("Embouteillage cause par accident", "Long embouteillage cause par un accident en amont", "traffic", "real"),
    ("Voiture en feu", "Vehicule en feu sur le bas-cote, pompiers sur place", "emergency", "real"),
    ("Panne de signalisation", "Panneaux routiers absents apres les travaux", "roadworks", "real"),
    ("Trottoir effondre", "Le trottoir s'est effondre pres de la route", "danger", "real"),
    ("Vehicle on fire", "Car on fire on the side of the highway, fire crews approaching", "emergency", "real"),
    ("Multi car pile up", "Multi car pile up due to fog this morning", "accident", "real"),

    # --- spam --------------------------------------------------------------
    ("Promotion incroyable", "Achetez maintenant! 50% de reduction sur tous les produits", "other", "spam"),
    ("Cliquez ici pour gagner", "Vous avez gagne un iPhone! Cliquez sur ce lien", "other", "spam"),
    ("Vente flash voiture", "Voiture neuve a vendre seulement 1000 dinars contactez moi", "other", "spam"),
    ("Buy crypto now", "Make 5000 dollars a week buying crypto, click my profile", "other", "spam"),
    ("Free vacation", "Win a free trip to Dubai, send your number now", "other", "spam"),
    ("Restaurant promo", "Notre nouveau restaurant ouvre demain, venez gouter le tajine", "other", "spam"),
    ("Cheap insurance", "Cheapest car insurance in Algeria, call this number", "other", "spam"),
    ("Telechargez notre app", "Telechargez notre nouvelle application de jeux", "other", "spam"),
    ("New shoes for sale", "Brand new sneakers for sale, message me", "other", "spam"),
    ("Solde gigantesque", "Solde sur tous les vetements, magasin du centre", "other", "spam"),
    ("Subscribe to my channel", "Subscribe to my YouTube channel for daily content", "other", "spam"),
    ("Offre unique", "Offre unique aujourd'hui seulement, ne ratez pas", "other", "spam"),
    ("Visit my shop", "Visit my online shop best prices guaranteed", "other", "spam"),
    ("MLM opportunity", "Earn passive income joining our team", "other", "spam"),
    ("Free iphone", "Win a free iphone 15 just by replying", "other", "spam"),
    ("Loto promo", "Tentez votre chance avec notre tirage exceptionnel", "other", "spam"),
    ("Recharge mobilis", "Recharge mobilis pas chere, contactez 0555", "other", "spam"),
    ("Investment opportunity", "Double your money in 30 days, guaranteed", "other", "spam"),
    ("Cours en ligne", "Apprenez l'anglais en 7 jours, inscription ouverte", "other", "spam"),
    ("Best phone deals", "Best phone deals in town, hurry up", "other", "spam"),
    ("Click my link", "Check out my new website, link in bio", "other", "spam"),

    # --- out_of_context ----------------------------------------------------
    ("Resultats du match", "Le match etait incroyable, 3 buts en seconde mi-temps", "other", "out_of_context"),
    ("Football news", "Real Madrid won the Champions League last night", "other", "out_of_context"),
    ("Recette de couscous", "Voici comment preparer un excellent couscous", "other", "out_of_context"),
    ("Bonjour tout le monde", "Salut, comment ca va aujourd'hui ?", "other", "out_of_context"),
    ("Joke of the day", "Why did the chicken cross the road? Because it could", "other", "out_of_context"),
    ("Anniversaire", "Joyeux anniversaire mon ami, profite bien", "other", "out_of_context"),
    ("Random thoughts", "I love sunsets and long walks on the beach", "other", "out_of_context"),
    ("Photo de famille", "Belle photo en famille au parc hier", "other", "out_of_context"),
    ("Movie review", "Just watched the new Marvel film, it was great", "other", "out_of_context"),
    ("Plat du jour", "Le plat du jour au restaurant etait delicieux", "other", "out_of_context"),
    ("Music playlist", "Sharing my favorite playlist with you", "other", "out_of_context"),
    ("Birthday party", "Had an amazing birthday party last night", "other", "out_of_context"),
    ("Mes vacances", "Souvenirs de mes vacances en Tunisie", "other", "out_of_context"),
    ("New haircut", "Got a new haircut today, what do you think", "other", "out_of_context"),
    ("Mon chat", "Mon chat fait des betises encore aujourd'hui", "other", "out_of_context"),
    ("Quote of the day", "Be the change you want to see in the world", "other", "out_of_context"),
    ("Conseil cuisine", "Astuce pour reussir le pain maison", "other", "out_of_context"),
    ("Random selfie", "Selfie at the beach this morning", "other", "out_of_context"),
    ("Politique news", "Le president a annonce hier de nouvelles mesures", "other", "out_of_context"),
    ("Bonne fete", "Bonne fete a tous mes amis musulmans", "other", "out_of_context"),
    ("Sports update", "Latest tennis scores from the open tournament", "other", "out_of_context"),
    ("Cinema sortie", "On va au cinema ce soir, qui veut venir", "other", "out_of_context"),

    # --- invalid_location: text says nothing or location-only nonsense -----
    ("test", "asdf qwer zxcv", "other", "invalid_location"),
    ("location only", ".......", "other", "invalid_location"),
    ("xxxxxx", "no info no info no info", "other", "invalid_location"),
    ("aaa", "bbb ccc", "other", "invalid_location"),
    ("loc test", "no description provided", "other", "invalid_location"),
    ("???", "????", "other", "invalid_location"),
    ("untitled", "no description", "other", "invalid_location"),
    ("placeholder", "placeholder text only", "other", "invalid_location"),
    ("test report", "test test test", "other", "invalid_location"),
    ("...", "...", "other", "invalid_location"),

    # --- suspicious: vague / suspicious / could be true but unclear --------
    ("Quelque chose s'est passe", "Je sais pas trop ce qui se passe la-bas", "other", "suspicious"),
    ("Bizarre", "Il y a un truc bizarre sur la route", "other", "suspicious"),
    ("Probleme", "Probleme quelque part, venez voir", "other", "suspicious"),
    ("Help", "Help help help", "other", "suspicious"),
    ("Au secours", "Au secours il y a un truc", "other", "suspicious"),
    ("Suspicious activity", "Something looks weird here", "other", "suspicious"),
    ("Ne sais pas", "Je sais pas mais c'est pas normal", "other", "suspicious"),
    ("Etrange", "Voiture etrange garee depuis longtemps", "other", "suspicious"),
    ("Wow", "Wow incredible look at this", "other", "suspicious"),
    ("Truc louche", "Y'a un truc louche au coin", "other", "suspicious"),
    ("Maybe accident", "I think maybe something happened over there", "other", "suspicious"),
    ("Personne sait", "Personne ne sait ce qui s'est passe ici", "other", "suspicious"),
    ("Look at this", "Look at this picture", "other", "suspicious"),
    ("Strange smell", "Strange smell coming from somewhere", "other", "suspicious"),
    ("Voiture suspecte", "Voiture suspecte qui tourne dans le quartier", "other", "suspicious"),
    ("Bruit suspect", "Bruit suspect mais je vois rien", "other", "suspicious"),
    ("Quelqu'un sait", "Quelqu'un sait ce qui se passe ici ?", "other", "suspicious"),
    ("Hmmmm", "Hmmmm bizarre ce qui se passe", "other", "suspicious"),
    ("Photo etrange", "Photo prise rapidement, je sais pas ce que c'est", "other", "suspicious"),
]


def build_dataset(rows: Sequence[Tuple[str, str, str, str]]):
    texts: List[str] = []
    labels: List[str] = []
    for title, description, incident_type, label in rows:
        text = build_text_input(title, description, incident_type)
        if not text:
            continue
        texts.append(text)
        labels.append(label)
    return texts, labels


def build_pipeline() -> Pipeline:
    return Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    analyzer="word",
                    ngram_range=(1, 2),
                    min_df=1,
                    max_df=0.95,
                    sublinear_tf=True,
                    strip_accents="unicode",
                    lowercase=True,
                ),
            ),
            (
                "clf",
                LogisticRegression(
                    max_iter=2000,
                    class_weight="balanced",
                    solver="lbfgs",
                ),
            ),
        ]
    )


def main(argv: Iterable[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Train SIARA report validator")
    parser.add_argument("--output", default=DEFAULT_MODEL_PATH, help="Output joblib path")
    parser.add_argument(
        "--metadata", default=DEFAULT_METADATA_PATH, help="Output metadata JSON path"
    )
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args(list(argv) if argv is not None else None)

    texts, labels = build_dataset(SEED_ROWS)
    if len(set(labels)) < len(LABELS):
        missing = sorted(set(LABELS) - set(labels))
        print(f"WARNING: missing labels in seed dataset: {missing}")

    x_train, x_test, y_train, y_test = train_test_split(
        texts,
        labels,
        test_size=args.test_size,
        random_state=args.random_state,
        stratify=labels,
    )

    pipeline = build_pipeline()
    pipeline.fit(x_train, y_train)

    y_pred = pipeline.predict(x_test)
    report = classification_report(
        y_test,
        y_pred,
        labels=list(LABELS),
        zero_division=0,
        output_dict=True,
    )
    print(classification_report(y_test, y_pred, labels=list(LABELS), zero_division=0))
    print("Confusion matrix (rows=true, cols=pred):")
    print(list(LABELS))
    print(confusion_matrix(y_test, y_pred, labels=list(LABELS)))

    output_path = os.path.abspath(args.output)
    metadata_path = os.path.abspath(args.metadata)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    joblib.dump(pipeline, output_path)

    metadata = {
        "model_name": DEFAULT_MODEL_NAME,
        "model_version": DEFAULT_MODEL_VERSION,
        "labels": list(LABELS),
        "training_date": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "test_size": args.test_size,
        "random_state": args.random_state,
        "training_examples": len(texts),
        "metrics": report,
        "thresholds": {
            "text_high_confidence": 0.65,
            "near_road_strict_m": DEFAULT_NEAR_ROAD_STRICT_M,
            "near_road_relaxed_m": DEFAULT_NEAR_ROAD_RELAXED_M,
        },
        "input_format": "title + ' ' + description + ' ' + incident_type",
        "score_units": "decimal probabilities in [0, 1]",
    }
    with open(metadata_path, "w", encoding="utf-8") as fh:
        json.dump(metadata, fh, indent=2, ensure_ascii=False)

    print(f"Saved model: {output_path}")
    print(f"Saved metadata: {metadata_path}")


if __name__ == "__main__":
    main()
