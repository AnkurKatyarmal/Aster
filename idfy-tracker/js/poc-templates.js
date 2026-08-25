/* ==========================================================================
   IDfy Project Tracker — poc-templates.js
   Predefined, editable default content per Privy module for the "New POC"
   kickoff/scope document and the completion report. Pick a module, the form
   pre-fills with sensible defaults, edit anything before generating.
   ========================================================================== */

var PocTemplates = (function () {
  "use strict";

  var MODULES = {
    CGP: {
      key: "CGP",
      label: "Consent Governance Platform (CGP)",
      dataModule: "CGP",
      kickoff: {
        objective: "Demonstrate Privy's Consent Governance Platform capturing, storing, and honoring data principal consent across the client's specified digital properties, in line with DPDP Act 2023 requirements.",
        scope: [
          "Integration of Privy consent capture widget on 1–2 nominated web/app journeys",
          "Configuration of processing purposes and consent categories as agreed with the client",
          "Consent artifact generation and storage (proof of consent)",
          "Webhook-based consent status delivery to a client-nominated endpoint",
          "UAT sign-off on the above in a non-production environment"
        ].join("\n"),
        timeline: [
          "Week 1: Kickoff, requirements confirmation, environment access",
          "Week 2: Consent widget integration and purpose configuration",
          "Week 3: Webhook integration and UAT",
          "Week 4: UAT sign-off and POC completion report"
        ].join("\n"),
        successCriteria: [
          "Consent is captured and recorded correctly for all configured purposes",
          "Consent status is retrievable via webhook within agreed SLA",
          "Consent artifacts are available for audit/reference",
          "No critical defects open at UAT sign-off"
        ].join("\n"),
        assumptions: [
          "Client will provide UAT environment access within 3 business days of kickoff",
          "Scope is limited to the nominated journey(s) — full rollout is a separate phase",
          "Client-side development effort for widget placement is the client's responsibility",
          "POC does not include production go-live or performance/load testing"
        ].join("\n")
      },
      completion: {
        metricFields: [
          { key: "purposesConfigured", label: "Processing Purposes Configured" },
          { key: "journeysIntegrated", label: "Journeys Integrated" },
          { key: "consentCaptureRate", label: "Consent Capture Rate" },
          { key: "webhookSuccessRate", label: "Webhook Delivery Success Rate" }
        ],
        findings: [
          "Consent capture and storage worked as expected across the configured purposes",
          "Webhook delivery met the agreed SLA in UAT testing"
        ].join("\n"),
        recommendation: "Based on the results of this POC, we recommend proceeding to full production rollout of the Consent Governance Platform across the remaining client properties.",
        nextSteps: [
          "Finalize production environment and infrastructure ownership",
          "Expand scope to remaining journeys/properties",
          "Schedule production go-live and DPO sign-off"
        ].join("\n")
      }
    },

    CookieManager: {
      key: "CookieManager",
      label: "Cookie Consent Manager",
      dataModule: "Cookie Manager",
      kickoff: {
        objective: "Demonstrate Privy's Cookie Consent Manager scanning, categorizing, and gating cookies/trackers on the client's nominated website(s), with a consent banner reflecting client branding.",
        scope: [
          "Cookie/tracker scan of 1–2 nominated domains or sub-domains",
          "Categorization of discovered cookies (necessary, functional, analytics, marketing)",
          "Consent banner deployment (client-branded) gating non-essential cookies pre-consent",
          "Consent log storage for audit purposes",
          "UAT sign-off in a non-production/staging environment"
        ].join("\n"),
        timeline: [
          "Week 1: Kickoff, domain access, initial scan",
          "Week 2: Cookie categorization review with client",
          "Week 3: Banner deployment and gating configuration",
          "Week 4: UAT sign-off and POC completion report"
        ].join("\n"),
        successCriteria: [
          "All cookies on the nominated domain(s) are discovered and categorized",
          "Non-essential cookies are correctly blocked prior to consent",
          "Consent choices are logged and retrievable",
          "Banner renders correctly across desktop and mobile"
        ].join("\n"),
        assumptions: [
          "Client will provide staging/domain access within 3 business days of kickoff",
          "Scope is limited to the nominated domain(s) — full rollout is a separate phase",
          "Any custom banner design work beyond standard theming is out of scope",
          "POC does not include production go-live"
        ].join("\n")
      },
      completion: {
        metricFields: [
          { key: "domainsScanned", label: "Domains Scanned" },
          { key: "cookiesDiscovered", label: "Cookies/Trackers Discovered" },
          { key: "cookiesCategorized", label: "Cookies Categorized" },
          { key: "consentRate", label: "Banner Consent Rate" }
        ],
        findings: [
          "Cookie scan successfully identified and categorized all trackers on the nominated domain(s)",
          "Consent banner correctly gated non-essential cookies pre-consent"
        ].join("\n"),
        recommendation: "Based on the results of this POC, we recommend proceeding to full production rollout of the Cookie Consent Manager across the remaining client domains.",
        nextSteps: [
          "Expand scope to remaining domains/sub-domains",
          "Finalize banner branding and localization if required",
          "Schedule production go-live"
        ].join("\n")
      }
    },

    DataCompass: {
      key: "DataCompass",
      label: "Data Compass",
      dataModule: "Data Compass",
      kickoff: {
        objective: "Demonstrate Privy's Data Compass discovering and classifying personal and sensitive personal data across the client's nominated data assets, producing a PII/PFI inventory.",
        scope: [
          "Connectivity and access setup to 1–2 nominated data assets",
          "Automated scanning and classification of PII/PFI fields",
          "Review of classification accuracy with the client data team",
          "Delivery of a PII/PFI inventory report",
          "UAT sign-off on classification accuracy"
        ].join("\n"),
        timeline: [
          "Week 1: Kickoff, access/connectivity setup",
          "Week 2: Scanning and classification run",
          "Week 3: Accuracy review and corrections with client",
          "Week 4: Final inventory delivery and POC completion report"
        ].join("\n"),
        successCriteria: [
          "Successful connectivity to all nominated data assets",
          "Classification accuracy meets or exceeds the agreed threshold",
          "PII/PFI inventory report delivered and reviewed with the client",
          "No critical connectivity or performance issues during scanning"
        ].join("\n"),
        assumptions: [
          "Client will provide network/firewall access within 3 business days of kickoff",
          "Scope is limited to the nominated data asset(s) — full rollout is a separate phase",
          "Client will make a data owner/SME available for the accuracy review",
          "POC does not include remediation or data masking action"
        ].join("\n")
      },
      completion: {
        metricFields: [
          { key: "assetsScanned", label: "Data Assets Scanned" },
          { key: "fieldsClassified", label: "PII/PFI Fields Classified" },
          { key: "piiClasses", label: "Distinct PII Classes Identified" },
          { key: "accuracyRate", label: "Classification Accuracy" }
        ],
        findings: [
          "Data Compass successfully scanned and classified the nominated data asset(s)",
          "Classification accuracy was validated with the client data team"
        ].join("\n"),
        recommendation: "Based on the results of this POC, we recommend proceeding to full production rollout of Data Compass across the remaining client data assets.",
        nextSteps: [
          "Expand scope to remaining data assets",
          "Define a recurring scan cadence for production",
          "Align classification taxonomy with the client's data governance policy"
        ].join("\n")
      }
    }
  };

  function get(key) { return MODULES[key] || null; }
  function list() { return Object.keys(MODULES).map(function (k) { return MODULES[k]; }); }

  return { MODULES: MODULES, get: get, list: list };
})();
