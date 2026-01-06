// Configuration and Strategy Manager

const ExtractionType = {
    SELECTOR_REGEX: 'SELECTOR_REGEX',
    PROGRAMMATIC_JS: 'PROGRAMMATIC_JS'
};

/**
 * Represents a strategy for a specific site.
 */
class SiteAdapter {
    constructor(config) {
        this.name = config.name;
        this.pattern = config.pattern; // Regex or string to match URL
        this.type = config.type;
        this.selector = config.selector; // For SELECTOR_REGEX
        this.customExtract = config.customExtract; // For PROGRAMMATIC_JS
    }

    match(url) {
        if (this.pattern instanceof RegExp) {
            return this.pattern.test(url);
        }
        return url.includes(this.pattern);
    }

    getElements() {
        if (this.type === ExtractionType.SELECTOR_REGEX) {
            // Convert NodeList to Array and filter for visibility if needed
            return Array.from(document.querySelectorAll(this.selector))
                .filter(el => el.offsetParent !== null); // Simple visibility check
        } else if (this.type === ExtractionType.PROGRAMMATIC_JS && this.customExtract) {
            return this.customExtract();
        }
        return [];
    }
}

class StrategyManager {
    constructor(configs) {
        this.adapters = configs.map(c => new SiteAdapter(c));
    }

    getStrategy(url) {
        return this.adapters.find(adapter => adapter.match(url));
    }

    createStrategy(config) {
        // Hydrate config if needed (e.g. converting string pattern to RegExp)
        if (typeof config.pattern === 'string' && config.pattern.startsWith('/')) {
            // Simple regex hydration - specific to how we stringified it? 
            // Actually, JSON.stringify turns regex to {}, so we need to be careful.
            // For now, let's assume the user edits the "selector" mainly.
            // If they provide a "pattern" string, we use it.
        }
        return new SiteAdapter(config);
    }
}

// Site Configurations
const SITE_CONFIGS = [
    {
        name: 'Google Search',
        pattern: /google\.com\/search/,
        type: ExtractionType.SELECTOR_REGEX,
        // Targets the main link in search results. 
        // Using :has(h3) to ensure we get the title link.
        selector: '#search .g a:has(h3)'
    },
    {
        name: 'YouTube Results',
        pattern: /youtube\.com\/results/,
        type: ExtractionType.PROGRAMMATIC_JS,
        customExtract: () => {
            // Targets the video title link in search results
            const videoTitles = Array.from(document.querySelectorAll('ytd-video-renderer #video-title'));
            return videoTitles.filter(el => el.offsetParent !== null);
        }
    },
    {
        name: 'YouTube Watch',
        pattern: /youtube\.com\/watch/,
        type: ExtractionType.PROGRAMMATIC_JS,
        customExtract: () => {
            // Targets side recommendations
            const recs = Array.from(document.querySelectorAll('ytd-compact-video-renderer #video-title'));
            return recs.filter(el => el.offsetParent !== null);
        }
    },
    {
        name: 'Wikipedia',
        pattern: /wikipedia\.org/,
        type: ExtractionType.SELECTOR_REGEX,
        selector: '#bodyContent a:not(.internal)'
    }
];

// Export globally
window.TUIStrategyManager = new StrategyManager(SITE_CONFIGS);
window.ExtractionType = ExtractionType;
