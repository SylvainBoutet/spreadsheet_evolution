# Documentation des formules Odoo Spreadsheet IROKOO

## Introduction

Ces formules personnalisées permettent d'extraire et de manipuler des données Odoo directement dans les feuilles de calcul (spreadsheets). Elles offrent un accès rapide et flexible aux données de votre système sans avoir à créer de rapports complexes ou à exporter des données.

## Formules disponibles

### IROKOO.GET_FIELD

Récupère la valeur d'un champ spécifique pour un enregistrement donné.

**Syntaxe:**
```
=IROKOO.GET_FIELD(model, id, field)
```

**Paramètres:**
- `model` (texte): Nom technique du modèle (ex: "res.partner")
- `id` (nombre): ID de l'enregistrement
- `field` (texte): Nom technique du champ à récupérer

**Exemple:**
```
=IROKOO.GET_FIELD("res.partner", 10, "name")
```

### IROKOO.GET_IDS

Récupère les IDs des enregistrements correspondant à des critères spécifiques.

**Syntaxe:**
```
=IROKOO.GET_IDS(model, order_field, direction, limit, filters)
```

**Paramètres:**
- `model` (texte): Nom technique du modèle (ex: "sale.order")
- `order_field` (texte): Champ à utiliser pour le tri
- `direction` (texte): Direction du tri ("asc" ou "desc")
- `limit` (nombre): Nombre maximum d'enregistrements à retourner (0 pour tous)
- `filters` (texte): Filtres séparés par des points-virgules

**Exemple:**
```
=IROKOO.GET_IDS("sale.order", "amount_total", "desc", 10, "state=sale;partner_id=42")
```

### IROKOO.GET_SUM

Calcule la somme d'un champ pour une liste d'IDs.

**Syntaxe:**
```
=IROKOO.GET_SUM(model, field, ids)
```

**Paramètres:**
- `model` (texte): Nom technique du modèle (ex: "sale.order")
- `field` (texte): Champ à additionner (ex: "amount_total")
- `ids` (texte): Liste d'IDs séparés par des virgules (généralement le résultat de GET_IDS)

**Exemple:**
```
=IROKOO.GET_SUM("sale.order", "amount_total", IROKOO.GET_IDS("sale.order", "", "", "", "state=sale"))
```

### IROKOO.GET_GROUPED_IDS

Regroupe les enregistrements par un champ et calcule une agrégation.

**Syntaxe:**
```
=IROKOO.GET_GROUPED_IDS(model, group_by, aggregate_field, aggregate_function, filters, limit)
```

**Paramètres:**
- `model` (texte): Nom technique du modèle (ex: "sale.order")
- `group_by` (texte): Champ utilisé pour le regroupement (ex: "partner_id")
- `aggregate_field` (texte): Champ à agréger (ex: "amount_total")
- `aggregate_function` (texte): Fonction d'agrégation ("sum", "avg", "count", "min", "max")
- `filters` (texte): Filtres séparés par des points-virgules
- `limit` (nombre): Nombre maximum de groupes à retourner

**Exemple:**
```
=IROKOO.GET_GROUPED_IDS("sale.order", "partner_id", "amount_total", "sum", "state:in:draft,sent", 10)
```

### IROKOO.SUM_BY_DOMAIN

Calcule directement la somme d'un champ pour les enregistrements correspondant à un domaine.

**Syntaxe:**
```
=IROKOO.SUM_BY_DOMAIN(model, field, filters)
```

**Paramètres:**
- `model` (texte): Nom technique du modèle (ex: "sale.order")
- `field` (texte): Champ à additionner (ex: "amount_total")
- `filters` (texte): Filtres séparés par des points-virgules

**Exemple:**
```
=IROKOO.SUM_BY_DOMAIN("sale.order", "amount_total", "partner_id=42;state:in:draft,sent")
```

## Syntaxe des filtres

Les filtres supportent plusieurs formats :

1. **Égalité simple**: `field=value`
   ```
   partner_id=42
   ```

2. **Comparaison**: `field>value`, `field<value`, `field!=value`
   ```
   amount_total>1000
   ```

3. **Opérateur spécifique**: `field:operator:value`
   ```
   name:ilike:test
   ```

4. **Valeurs multiples**: `field:in:value1,value2,...`
   ```
   state:in:draft,sent
   ```

5. **Recherche approximative**: `field~value` (équivalent à ilike)
   ```
   name~test
   ```

6. **Combinaison de filtres** séparés par des points-virgules
   ```
   partner_id=42;state:in:draft,sent
   ```

## Notes importantes

- Pour les formules utilisant des concaténations dans les filtres, utilisez des cellules intermédiaires:
  ```
  Dans C1: ="partner_id="&B1
  Dans C2: =C1&";state:in:draft,sent"
  Formule: =IROKOO.SUM_BY_DOMAIN("sale.order", "amount_total", C2)
  ```

- La fonction IROKOO.GET_GROUPED_IDS renvoie les IDs des groupes, pas les valeurs agrégées.

- Pour des performances optimales, limitez le nombre de formules par feuille et utilisez des critères spécifiques. 