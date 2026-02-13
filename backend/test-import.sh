#!/bin/bash

# Script de test pour l'import Excel
# Usage: ./test-import.sh fichier.xlsx

echo "🔍 Test d'import Excel pour CIM-SemanticGraph-Platform"
echo "=================================================="
echo ""

# Vérifier que le fichier est fourni
if [ -z "$1" ]; then
    echo "❌ Erreur: Veuillez fournir un fichier Excel"
    echo "Usage: ./test-import.sh fichier.xlsx"
    exit 1
fi

FILE=$1

# Vérifier que le fichier existe
if [ ! -f "$FILE" ]; then
    echo "❌ Erreur: Le fichier '$FILE' n'existe pas"
    exit 1
fi

echo "📁 Fichier: $FILE"
echo ""

# 1. Test de santé du backend
echo "1️⃣ Vérification du backend..."
HEALTH=$(curl -s http://localhost:8080/api/actuator/health)
if echo "$HEALTH" | grep -q "UP"; then
    echo "   ✅ Backend: UP"
else
    echo "   ❌ Backend: DOWN ou non accessible"
    echo "   Réponse: $HEALTH"
    exit 1
fi
echo ""

# 2. Test de l'endpoint Excel
echo "2️⃣ Vérification de l'endpoint Excel..."
FORMAT=$(curl -s -u admin:admin123 http://localhost:8080/api/excel/format)
if echo "$FORMAT" | grep -q "supportedFormats"; then
    echo "   ✅ Endpoint Excel: OK"
else
    echo "   ❌ Endpoint Excel: Erreur"
    echo "   Réponse: $FORMAT"
    exit 1
fi
echo ""

# 3. Import du fichier
echo "3️⃣ Import du fichier Excel..."
echo "   ⏳ En cours..."
echo ""

RESPONSE=$(curl -s -X POST http://localhost:8080/api/excel/import \
  -H "Content-Type: multipart/form-data" \
  -u admin:admin123 \
  -F "file=@$FILE" \
  -w "\nHTTP_CODE:%{http_code}")

# Extraire le code HTTP
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

echo "   📊 Résultat de l'import:"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Import réussi (HTTP $HTTP_CODE)"
    echo ""
    echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
else
    echo "   ❌ Échec de l'import (HTTP $HTTP_CODE)"
    echo ""
    echo "$BODY"
fi

echo ""
echo "=================================================="

# 4. Statistiques du graphe
if [ "$HTTP_CODE" = "200" ]; then
    echo ""
    echo "4️⃣ Statistiques du graphe après import:"
    STATS=$(curl -s -u admin:admin123 http://localhost:8080/api/cim/statistics)
    echo "$STATS" | python3 -m json.tool 2>/dev/null || echo "$STATS"
fi

echo ""
echo "✅ Test terminé !"
