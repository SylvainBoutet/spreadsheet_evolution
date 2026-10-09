# Guide de Contribution - Spreadsheet Extension

Merci de votre intérêt pour ce module éducatif ! Vos contributions sont les bienvenues pour améliorer la qualité pédagogique du projet.

## 🎯 Objectif du Projet

Ce module a pour vocation d'être un **exemple éducatif** montrant comment étendre les spreadsheets Odoo. Il n'est pas destiné à un usage commercial intensif mais plutôt à l'apprentissage et à la démonstration.

## 🤝 Types de Contributions Bienvenues

### 📚 Documentation
- Amélioration du README.md
- Ajout d'exemples dans EXAMPLES.md
- Traductions en d'autres langues
- Tutoriels vidéo ou articles de blog

### 🐛 Corrections de Bugs
- Corrections de bugs évidents
- Amélioration de la gestion d'erreurs
- Optimisations de performance mineures

### 💡 Nouvelles Fonctionnalités Éducatives
- Nouvelles formules simples et bien documentées
- Plugins d'exemple supplémentaires
- Outils de debugging améliorés

### ❌ Contributions NON Souhaitées
- Fonctionnalités complexes nécessitant un support long terme
- Modifications majeures de l'architecture
- Intégrations avec des systèmes externes complexes

## 📋 Processus de Contribution

### 1. Avant de Commencer
- Ouvrez une issue pour discuter de votre idée
- Assurez-vous que votre contribution s'aligne avec l'objectif éducatif
- Vérifiez qu'elle n'existe pas déjà

### 2. Développement
- Forkez le repository
- Créez une branche descriptive : `feature/nouvelle-formule` ou `fix/bug-cache`
- Suivez les conventions de code Odoo
- Ajoutez de la documentation pour toute nouvelle fonctionnalité

### 3. Tests
- Testez votre code sur une instance Odoo 17.0
- Vérifiez que les exemples existants fonctionnent toujours
- Ajoutez des exemples d'usage dans EXAMPLES.md

### 4. Pull Request
- Créez une PR avec une description claire
- Référencez l'issue correspondante
- Expliquez la valeur pédagogique de votre contribution

## 📝 Standards de Code

### JavaScript
```javascript
// Utilisez des commentaires explicatifs
export class MonPlugin extends OdooUIPlugin {
    /**
     * Description claire de la méthode
     * @param {string} param - Description du paramètre
     * @returns {Object} Description du retour
     */
    maMethode(param) {
        // Logique claire et commentée
    }
}
```

### Documentation
- Utilisez des exemples concrets
- Expliquez le "pourquoi" pas seulement le "comment"
- Incluez des cas d'usage métier

## 🎓 Valeur Éducative

Chaque contribution doit avoir une **valeur pédagogique claire** :

### ✅ Bon Exemple
```javascript
// Formule simple qui démontre l'accès aux données
functionRegistry.add("IROKOO.GET_COUNT", {
    description: _t("Count records matching criteria"),
    compute: function (model, filters) {
        // Code simple et bien commenté
        const ids = this.getters.searchRecords(model, domain);
        return { value: ids.split(',').length };
    },
});
```

### ❌ Mauvais Exemple
```javascript
// Formule complexe sans valeur pédagogique claire
functionRegistry.add("IROKOO.COMPLEX_ANALYTICS", {
    compute: function (a, b, c, d, e, f) {
        // Logique complexe difficile à comprendre
        // Sans documentation ni exemples
    },
});
```

## 🚀 Idées de Contributions

### Formules Simples
- `IROKOO.GET_COUNT` : Compter des enregistrements
- `IROKOO.GET_FIRST` : Premier enregistrement d'une recherche
- `IROKOO.GET_LAST` : Dernier enregistrement d'une recherche

### Plugins d'Exemple
- Plugin de validation de données
- Plugin de formatage automatique
- Plugin de notifications

### Documentation
- Guide de démarrage rapide
- Comparaison avec d'autres solutions
- FAQ des erreurs courantes

## 🔍 Review Process

1. **Review Automatique** : Vérification de la syntaxe et des standards
2. **Review Pédagogique** : Évaluation de la valeur éducative
3. **Test Fonctionnel** : Validation sur instance Odoo
4. **Merge** : Intégration après validation

## 📞 Contact

Pour toute question sur les contributions :
- Ouvrez une issue GitHub
- Contactez l'auteur original : Sylvain Boutet (IROKOO)

## 🙏 Remerciements

Merci à tous les contributeurs qui aident à faire de ce module une ressource éducative de qualité !

---

> 💡 **Rappel** : L'objectif est d'apprendre et de partager des connaissances, pas de créer un produit commercial. Gardez cela à l'esprit dans vos contributions. 