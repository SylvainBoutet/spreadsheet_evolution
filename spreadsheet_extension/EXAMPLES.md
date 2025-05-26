# Exemples Pratiques - Spreadsheet Extension

Ce fichier contient des exemples concrets d'utilisation du module `spreadsheet_extension` pour vous aider à comprendre et maîtriser les formules IROKOO.

## 🎯 Exemples par Niveau

### 📚 Niveau Débutant

#### Exemple 1 : Liste des Partenaires
**Objectif** : Créer un tableau simple avec les informations des partenaires

| A | B | C | D |
|---|---|---|---|
| ID | Nom | Email | Ville |
| 1 | =IROKOO.GET_FIELD("res.partner", A2, "name") | =IROKOO.GET_FIELD("res.partner", A2, "email") | =IROKOO.GET_FIELD("res.partner", A2, "city") |
| 2 | =IROKOO.GET_FIELD("res.partner", A3, "name") | =IROKOO.GET_FIELD("res.partner", A3, "email") | =IROKOO.GET_FIELD("res.partner", A3, "city") |

#### Exemple 2 : Recherche Simple
**Objectif** : Trouver tous les partenaires d'une ville

```
=IROKOO.GET_IDS("res.partner", "name", "asc", 10, "city=Paris")
```

#### Exemple 3 : Compter des Enregistrements
**Objectif** : Compter le nombre de commandes confirmées

```
=LEN(SPLIT(IROKOO.GET_IDS("sale.order", "id", "desc", 0, "state=sale"), ","))
```

### 📊 Niveau Intermédiaire

#### Exemple 4 : Tableau de Bord des Ventes
**Objectif** : Créer un dashboard commercial

| Indicateur | Formule | Résultat |
|------------|---------|----------|
| CA Total | =IROKOO.GET_SUM("sale.order", "amount_total", IROKOO.GET_IDS("sale.order", "id", "desc", 0, "state=sale")) | |
| Nb Commandes | =LEN(SPLIT(IROKOO.GET_IDS("sale.order", "id", "desc", 0, "state=sale"), ",")) | |
| Panier Moyen | =B2/B3 | |
| CA du Mois | =IROKOO.GET_SUM("sale.order", "amount_total", IROKOO.GET_IDS("sale.order", "id", "desc", 0, "state=sale;date_order>2024-11-01")) | |

#### Exemple 5 : Analyse par Vendeur
**Objectif** : Comparer les performances des vendeurs

| Vendeur | CA | Nb Commandes |
|---------|----|----|
| =IROKOO.GET_FIELD("res.users", 1, "name") | =IROKOO.GET_SUM("sale.order", "amount_total", IROKOO.GET_IDS("sale.order", "id", "desc", 0, "user_id=1;state=sale")) | =LEN(SPLIT(IROKOO.GET_IDS("sale.order", "id", "desc", 0, "user_id=1;state=sale"), ",")) |

#### Exemple 6 : Filtres Avancés
**Objectif** : Utiliser différents opérateurs de filtrage

```
# Commandes supérieures à 1000€
=IROKOO.GET_IDS("sale.order", "amount_total", "desc", 10, "amount_total>1000")

# Factures de ce mois
=IROKOO.GET_IDS("account.move", "date", "desc", 0, "move_type=out_invoice;date>2024-11-01")

# Partenaires avec email contenant "gmail"
=IROKOO.GET_IDS("res.partner", "name", "asc", 0, "email:ilike:%gmail%")

# Produits de catégories spécifiques
=IROKOO.GET_IDS("product.product", "name", "asc", 0, "categ_id:in:1,2,3")
```

### 🚀 Niveau Avancé

#### Exemple 7 : Analyse Temporelle
**Objectif** : Comparer les ventes par période

| Période | CA | Évolution |
|---------|----|----|
| Novembre 2024 | =IROKOO.GET_SUM("sale.order", "amount_total", IROKOO.GET_IDS("sale.order", "id", "desc", 0, "state=sale;date_order>2024-11-01;date_order<2024-12-01")) | |
| Octobre 2024 | =IROKOO.GET_SUM("sale.order", "amount_total", IROKOO.GET_IDS("sale.order", "id", "desc", 0, "state=sale;date_order>2024-10-01;date_order<2024-11-01")) | |
| Évolution | =(B2-B3)/B3*100 | |

#### Exemple 8 : Regroupements Complexes
**Objectif** : Utiliser GET_GROUPED_IDS pour des analyses poussées

```
# Ventes par état de commande
=IROKOO.GET_GROUPED_IDS("sale.order", "state", "amount_total", "sum", "", 10)

# Top 5 des clients par CA
=IROKOO.GET_GROUPED_IDS("sale.order", "partner_id", "amount_total", "sum", "state=sale", 5)

# Moyenne des commandes par vendeur
=IROKOO.GET_GROUPED_IDS("sale.order", "user_id", "amount_total", "avg", "state=sale", 0)
```

## 🏭 Cas d'Usage Métier

### 📈 Dashboard Directeur Commercial

```
| KPI | Formule |
|-----|---------|
| CA Année | =IROKOO.GET_SUM("sale.order", "amount_total", IROKOO.GET_IDS("sale.order", "id", "desc", 0, "state=sale;date_order>2024-01-01")) |
| Objectif Atteint | =B2/1000000*100 |
| Meilleur Vendeur | =IROKOO.GET_FIELD("res.users", IROKOO.GET_IDS("res.users", "id", "desc", 1, ""), "name") |
| Nb Prospects | =LEN(SPLIT(IROKOO.GET_IDS("res.partner", "id", "desc", 0, "is_company=true;customer_rank=0"), ",")) |
```

### 📦 Gestion des Stocks

```
| Indicateur | Formule |
|------------|---------|
| Produits en Rupture | =IROKOO.GET_IDS("product.product", "name", "asc", 0, "qty_available<1") |
| Stock Total | =IROKOO.GET_SUM("product.product", "qty_available", IROKOO.GET_IDS("product.product", "id", "desc", 0, "active=true")) |
| Valeur Stock | =IROKOO.GET_SUM("product.product", "standard_price", IROKOO.GET_IDS("product.product", "id", "desc", 0, "qty_available>0")) |
```

### 💰 Analyse Financière

```
| Métrique | Formule |
|----------|---------|
| Factures Impayées | =IROKOO.GET_SUM("account.move", "amount_total", IROKOO.GET_IDS("account.move", "id", "desc", 0, "move_type=out_invoice;payment_state=not_paid")) |
| Délai Moyen Paiement | =IROKOO.GET_GROUPED_IDS("account.move", "payment_state", "id", "count", "move_type=out_invoice", 0) |
| CA Encaissé | =IROKOO.GET_SUM("account.move", "amount_total", IROKOO.GET_IDS("account.move", "id", "desc", 0, "move_type=out_invoice;payment_state=paid")) |
```

## 🔧 Techniques Avancées

### Formules Imbriquées
```
# Nom du client de la plus grosse commande
=IROKOO.GET_FIELD("res.partner", 
  IROKOO.GET_FIELD("sale.order", 
    IROKOO.GET_IDS("sale.order", "amount_total", "desc", 1, "state=sale"), 
    "partner_id"), 
  "name")
```

### Conditions avec IF
```
# Statut basé sur le CA
=IF(IROKOO.GET_SUM("sale.order", "amount_total", IROKOO.GET_IDS("sale.order", "id", "desc", 0, "partner_id=1;state=sale"))>10000, "VIP", "Standard")
```

### Calculs de Pourcentages
```
# Part de marché d'un vendeur
=IROKOO.GET_SUM("sale.order", "amount_total", IROKOO.GET_IDS("sale.order", "id", "desc", 0, "user_id=1;state=sale")) / 
 IROKOO.GET_SUM("sale.order", "amount_total", IROKOO.GET_IDS("sale.order", "id", "desc", 0, "state=sale")) * 100
```

## 🐛 Résolution de Problèmes

### Erreurs Courantes

#### "Record not found"
- Vérifiez que l'ID existe
- Contrôlez les droits d'accès
- Utilisez des IDs valides

#### "Field not found"  
- Vérifiez l'orthographe du champ
- Assurez-vous que le champ existe sur le modèle
- Consultez la documentation du modèle

#### Formule qui ne se met pas à jour
- Activez le debug : `DEBUG_FORMULAS = true`
- Vérifiez la console du navigateur
- Essayez de recalculer manuellement

### Optimisation des Performances

1. **Limitez les résultats** : Utilisez toujours un `limit` raisonnable
2. **Cache intelligent** : Les résultats sont mis en cache automatiquement
3. **Évitez les boucles** : Ne créez pas de références circulaires
4. **Filtres efficaces** : Utilisez des filtres précis pour réduire les données

## 📝 Exercices Pratiques

### Exercice 1 : Dashboard Personnel
Créez un tableau de bord pour analyser vos propres données :
- Vos commandes en cours
- Votre CA personnel
- Vos clients les plus importants

### Exercice 2 : Analyse Produit
Analysez les performances des produits :
- Top 10 des produits vendus
- Produits en rupture de stock
- Marge par catégorie

### Exercice 3 : Suivi Client
Créez un suivi client avancé :
- Clients inactifs depuis 6 mois
- Évolution du CA par client
- Nouveaux clients du mois

---

💡 **Conseil** : Commencez par des formules simples et complexifiez progressivement. N'hésitez pas à consulter les logs de la console pour comprendre le comportement des formules. 