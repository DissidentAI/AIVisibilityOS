import type { Translate } from "./shared";
export function auditLabel(code: string, t: Translate) {
  const labels: Record<string, [string, string]> = {
    queued: ["En attente", "Queued"],
    running: ["Exploration en cours", "Crawling"],
    completed: ["Exploration terminée", "Crawl completed"],
    partial: ["Couverture partielle", "Partial coverage"],
    blocked: ["Exploration bloquée", "Crawl blocked"],
    failed: ["Échec", "Failed"],
    cancelled: ["Arrêté", "Stopped"],
    page_limit: ["Limite de pages atteinte", "Page limit reached"],
    depth_limit: ["Profondeur maximale atteinte", "Depth limit reached"],
    discovery_limit: ["Limite de découverte atteinte", "Discovery limit reached"],
    sitemap_limit: ["Limite de sitemaps atteinte", "Sitemap limit reached"],
    audit_time_limit: ["Durée maximale atteinte", "Time limit reached"],
    audit_byte_limit: ["Volume maximal atteint", "Byte limit reached"],
    robots_disallowed: ["Accès interdit par robots.txt", "Blocked by robots.txt"],
    robots_unavailable: [
      "robots.txt inaccessible : exploration arrêtée",
      "robots.txt unavailable: crawl stopped",
    ],
    robots_invalid: ["robots.txt inexploitable", "Invalid robots.txt"],
    crawl_delay_limit: [
      "Délai demandé par le site trop long pour cet audit",
      "Site crawl delay exceeds this audit's time limit",
    ],
    site_rate_limited: [
      "Le site limite les accès ; exploration arrêtée",
      "Site is rate limiting access; crawl stopped",
    ],
    unavailable_pages: [
      "Certaines pages n’ont pas pu être analysées",
      "Some pages could not be analyzed",
    ],
    user_cancelled: ["Arrêt demandé", "Stop requested"],
    private_network_blocked: [
      "Adresse réseau non publique bloquée",
      "Non-public network address blocked",
    ],
    url_outside_site: ["Adresse hors du domaine autorisé", "URL outside the allowed domain"],
    fetch_failed: ["Connexion impossible", "Connection failed"],
    fetch_timeout: ["Délai de connexion dépassé", "Request timed out"],
    page_too_large: ["Page trop volumineuse", "Page too large"],
    not_html: ["Document non HTML", "Non-HTML document"],
    missing_title: ["Titre absent", "Missing title"],
    multiple_titles: ["Plusieurs titres HTML", "Multiple HTML titles"],
    missing_description: ["Description absente", "Missing description"],
    missing_h1: ["Titre H1 absent", "Missing H1"],
    multiple_h1: ["Plusieurs H1 : pertinence à vérifier", "Multiple H1s: review intent"],
    missing_language: ["Langue HTML non déclarée", "HTML language not declared"],
    missing_canonical: [
      "Canonical absente : pertinence à vérifier",
      "Missing canonical: review intent",
    ],
    invalid_canonical: ["Adresse canonical invalide", "Invalid canonical URL"],
    external_canonical: ["Canonical vers un autre domaine", "Canonical points to another domain"],
    noindex: ["Directive noindex observée", "Noindex directive observed"],
    invalid_json_ld: ["JSON-LD non analysable", "Unparseable JSON-LD"],
    no_json_ld: ["Aucun type JSON-LD observé", "No JSON-LD type observed"],
    images_without_alt: ["Images sans attribut alt", "Images missing alt attributes"],
    little_initial_text: ["Peu de texte dans le HTML initial", "Little text in initial HTML"],
    high: ["Priorité haute", "High priority"],
    medium: ["Priorité moyenne", "Medium priority"],
    low: ["Priorité basse", "Low priority"],
  };
  const entry = labels[code];
  return entry ? t(...entry) : /^http_\d{3}$/.test(code) ? `HTTP ${code.slice(5)}` : code;
}
