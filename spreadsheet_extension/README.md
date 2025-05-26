# Spreadsheet Extension - Module Éducatif Odoo

> ⚠️ **AVERTISSEMENT - USAGE ÉDUCATIF UNIQUEMENT** ⚠️
> 
> Ce module est fourni **exclusivement à des fins d'apprentissage et de démonstration**.
> 
> **🚫 INTERDIT EN PRODUCTION** sans tests approfondis et validation complète
> 
> **📋 CONDITIONS D'USAGE :**
> - ✅ Apprentissage et formation
> - ✅ Développement et tests en environnement isolé
> - ✅ Étude de l'architecture Odoo
> - ❌ Déploiement en production tel quel
> - ❌ Usage commercial sans validation
> 
> **⚖️ RESPONSABILITÉ :** Toute utilisation en environnement de production ou commercial se fait sous votre entière responsabilité. L'auteur décline toute responsabilité en cas de dysfonctionnement, perte de données ou problème de sécurité.
> 
> **🔒 SÉCURITÉ :** Ce module n'a pas fait l'objet d'un audit de sécurité. Il peut contenir des vulnérabilités. Ne l'utilisez jamais sur des données sensibles ou en production.

## 📋 Description

Ce module étend les capacités des spreadsheets Odoo en ajoutant des formules personnalisées permettant d'accéder directement aux données de la base depuis une feuille de calcul.

**Développé par** : Sylvain Boutet - IROKOO (https://www.irokoo.fr)

## 🎯 Objectifs Pédagogiques

Ce module démontre comment :
- Étendre le système de formules des spreadsheets Odoo
- Créer des plugins personnalisés pour o-spreadsheet
- Gérer le cache et les requêtes asynchrones
- Intégrer des fonctionnalités backend avec le frontend

## 🚀 Installation

1. Placez le module dans votre dossier `addons`
2. Mettez à jour la liste des modules
3. Installez le module `spreadsheet_extension`
4. Le module dépend de `spreadsheet` (module standard Odoo)

## 📊 Formules Disponibles

### `IROKOO.GET_FIELD(model, id, field)`
Récupère la valeur d'un champ pour un enregistrement spécifique.

**Exemple :**
```
=IROKOO.GET_FIELD("res.partner", 1, "name")
=IROKOO.GET_FIELD("sale.order", A2, "amount_total")
```

### `IROKOO.GET_IDS(model, order_field, direction, limit, filters)`
Recherche des IDs selon des critères.

**Exemples :**
```
=IROKOO.GET_IDS("res.partner", "name", "asc", 10, "city=Paris")
=IROKOO.GET_IDS("sale.order", "date_order", "desc", 5, "state=sale;amount_total>1000")
=IROKOO.GET_IDS("account.move", "id", "desc", 0, "move_type=out_invoice;state=posted")
```

**Opérateurs de filtrage supportés :**
- `=` : égalité
- `>`, `<` : comparaison
- `!=` : différent
- `ilike` : recherche textuelle (avec %)
- `:in:` : appartenance à une liste

### `IROKOO.GET_SUM(model, field, ids)`
Calcule la somme d'un champ pour une liste d'IDs.

**Exemple :**
```
=IROKOO.GET_SUM("sale.order", "amount_total", B2)
```
Où B2 contient le résultat d'un `GET_IDS`.

### `IROKOO.GET_GROUPED_IDS(model, group_by, aggregate_field, function, filters, limit)`
Effectue des regroupements avec agrégation.

**Exemple :**
```
=IROKOO.GET_GROUPED_IDS("sale.order", "state", "amount_total", "sum", "date_order>2024-01-01", 5)
```

## 🏗️ Architecture Technique

### Structure du Module
```
spreadsheet_extension/
├── __manifest__.py
├── static/src/js/
│   ├── index.js              # Point d'entrée
│   ├── irokoo_formulas.js    # Définition des formules
│   ├── utils.js              # Utilitaires
│   └── plugins/              # Plugins personnalisés
│       ├── get_field_plugin.js
│       ├── search_plugin.js
│       └── sum_plugin.js
```

### Plugins Principaux

#### GetFieldPlugin
- Gère l'accès direct aux champs d'enregistrements
- Implémente un système de cache
- Gestion des rafraîchissements automatiques

#### SearchPlugin  
- Gère les recherches avec domaines complexes
- Support des requêtes asynchrones
- Cache intelligent par cellule

#### SumPlugin
- Calculs d'agrégation sur des ensembles d'IDs
- Optimisation des requêtes groupées

## 💡 Exemples d'Usage

### Tableau de Bord Commercial
```
| Indicateur | Formule |
|------------|---------|
| CA Mensuel | =IROKOO.GET_SUM("sale.order", "amount_total", IROKOO.GET_IDS("sale.order", "id", "desc", 0, "state=sale;date_order>2024-11-01")) |
| Nb Commandes | =LEN(SPLIT(IROKOO.GET_IDS("sale.order", "id", "desc", 0, "state=sale"), ",")) |
| Top Client | =IROKOO.GET_FIELD("res.partner", IROKOO.GET_IDS("res.partner", "sale_order_count", "desc", 1, ""), "name") |
```

### Analyse des Stocks
```
=IROKOO.GET_IDS("product.product", "qty_available", "asc", 10, "qty_available<10")
=IROKOO.GET_SUM("stock.move", "product_qty", IROKOO.GET_IDS("stock.move", "id", "desc", 0, "state=done;date>2024-11-01"))
```

## 🔧 Développement et Extension

### Ajouter une Nouvelle Formule

1. **Enregistrer la formule** dans `irokoo_formulas.js` :
```javascript
functionRegistry.add("IROKOO.MA_FORMULE", {
    description: _t("Description de ma formule"),
    args: [
        arg("param1 (string)", _t("Description du paramètre")),
    ],
    category: "Odoo",
    returns: ["STRING"],
    compute: function (param1) {
        // Logique de la formule
        return { value: result, format: "@" };
    },
});
```

2. **Créer un plugin** si nécessaire dans `plugins/` :
```javascript
export class MonPlugin extends OdooUIPlugin {
    static getters = ["maMethode"];
    
    maMethode(param) {
        // Logique du plugin
    }
}
```

3. **Enregistrer le plugin** dans `index.js` :
```javascript
featurePluginRegistry.add("monPlugin", MonPlugin);
```

### Gestion du Cache
Les plugins implémentent différentes stratégies de cache :
- **GetFieldPlugin** : Cache par clé `model-id-field`
- **SearchPlugin** : Cache par cellule et critères
- **SumPlugin** : Cache par modèle et liste d'IDs

### Gestion des Requêtes Asynchrones
Le système gère automatiquement :
- Les requêtes en attente avec `requiresRefresh`
- Les timeouts pour éviter les boucles infinies
- La synchronisation entre plugins

## ⚠️ Limitations et Considérations

### Performance
- Les formules font des appels directs à la base de données
- Le cache améliore les performances mais consomme de la mémoire
- Évitez les formules trop complexes sur de gros volumes

### 🔒 Sécurité - IMPORTANT
- **Aucun audit de sécurité** n'a été effectué sur ce module
- Les formules respectent les droits d'accès Odoo mais **sans validation supplémentaire**
- **Risques potentiels** : injection de code, accès non autorisé aux données
- À utiliser **uniquement par des utilisateurs de confiance** en environnement de test
- **JAMAIS en production** sans audit de sécurité complet
- **Pas de chiffrement** des données en cache
- **Logs de debug** peuvent contenir des informations sensibles

### Compatibilité
- Testé sur Odoo 18.0
- Dépend du module `spreadsheet` standard
- Peut nécessiter des adaptations pour d'autres versions

### 🚨 Avertissements Supplémentaires
- **Données sensibles** : Ne jamais utiliser avec des données confidentielles
- **Environnement isolé** : Tests uniquement sur des instances de développement
- **Sauvegarde** : Toujours sauvegarder avant installation
- **Monitoring** : Surveiller les performances et les logs d'erreur
- **Mise à jour** : Module non maintenu - pas de correctifs de sécurité garantis

## 🎓 Exercices Pédagogiques

### Niveau Débutant
1. Créer un tableau listant tous les partenaires avec leur ville
2. Calculer le nombre total de commandes confirmées
3. Afficher le nom du produit le plus vendu

### Niveau Intermédiaire  
1. Créer un tableau de bord des ventes par mois
2. Analyser les stocks par catégorie de produit
3. Comparer les performances des vendeurs

### Niveau Avancé
1. Créer un plugin personnalisé pour une nouvelle formule
2. Implémenter un système de cache optimisé
3. Ajouter la gestion d'erreurs avancée

## 📝 Notes de Développement

### Debugging
Activez le debug en modifiant `DEBUG_FORMULAS = true` dans `irokoo_formulas.js`.

### Tests
Le module inclut des mécanismes d'initialisation sécurisée qui fonctionnent même sans données de test.

### Contribution
Ce module est fourni tel quel à des fins éducatives. Les contributions sont les bienvenues pour améliorer la documentation ou corriger des bugs évidents.

## 📞 Contact

**Développeur Original** : Sylvain Boutet  
**Entreprise** : IROKOO - https://www.irokoo.fr  
**Email** : info@irokoo.fr

---

> 🎯 **Objectif** : Ce module vise à démontrer les possibilités d'extension des spreadsheets Odoo et à servir de base d'apprentissage pour la communauté des développeurs. 