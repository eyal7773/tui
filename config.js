// Configuration and Strategy Manager

const ExtractionType = {
    SELECTOR_REGEX: 'SELECTOR_REGEX',
    PROGRAMMATIC_JS: 'PROGRAMMATIC_JS',
    ZONED_LAYOUT: 'ZONED_LAYOUT'
};

/**
 * Represents a strategy for a specific site.
 */
class SiteAdapter {
    constructor(config) {
        this.config = config; // Store full config
        this.name = config.name;
        this.pattern = config.pattern;
        this.type = config.type;
        this.selector = config.selector;
        this.customExtract = config.customExtract;
        this.zones = config.zones || [];
        this.neighbors = config.neighbors || {};
    }

    match(url) {
        if (this.pattern instanceof RegExp) {
            return this.pattern.test(url);
        }
        return url.includes(this.pattern);
    }

    getElements() {
        if (this.type === ExtractionType.SELECTOR_REGEX) {
            return Array.from(document.querySelectorAll(this.selector))
                .filter(el => el.offsetParent !== null);
        } else if (this.type === ExtractionType.PROGRAMMATIC_JS && this.customExtract) {
            return this.customExtract();
        } else if (this.type === ExtractionType.ZONED_LAYOUT) {
            // Flatten all zones for backward compatibility or global counting
            return this.zones.flatMap(zone =>
                Array.from(document.querySelectorAll(zone.selector))
                    .filter(el => el.offsetParent !== null)
            );
        }
        return [];
    }

    // New helper for retrieving elements per zone
    getZoneElements(zoneId) {
        const zone = this.zones.find(z => z.id === zoneId);
        if (!zone) return [];
        return Array.from(document.querySelectorAll(zone.selector))
            .filter(el => el.offsetParent !== null);
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
        return new SiteAdapter(config);
    }
}

// Site Configurations
const SITE_CONFIGS = [
    {
        name: 'Google Search',
        pattern: /google\.com\/search/,
        type: ExtractionType.ZONED_LAYOUT,
        zones: [
            {
                id: 'tabs',
                selector: '.hdtb-mitem a, .nfSAd a', // Standard tabs + "More" menu
                direction: 'horizontal',
                style: 'border-bottom: 2px solid blue' // Optional debug style
            },
            {
                id: 'results',
                selector: '#search a:has(h3), #rso .g a:has(h3)', // Main results
                direction: 'vertical',
                default: true
            },
            {
                id: 'sidebar',
                selector: '#rhs a.wUn7G, #rhs a:has(h2)', // Knowledge graph
                direction: 'vertical'
            }
        ],
        neighbors: {
            'results': { 'up': 'tabs', 'right': 'sidebar' },
            'tabs': { 'down': 'results', 'right': 'sidebar' }, // Fallback if sidebar is high up
            'sidebar': { 'left': 'results', 'up': 'tabs' }
        }
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
