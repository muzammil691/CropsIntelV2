function u(t){if(t==null)return 0;const n=Number(t);return Number.isNaN(n)?0:n}function i(t){if(!t||typeof t!="string")return t;const n=t.match(/^(\d{4})\s*[/\-]\s*(\d{2,4})$/);if(!n)return t;const e=n[1];let r=n[2];return r.length===4&&(r=r.slice(2)),`${e}/${r}`}export{i as n,u as t};
//# sourceMappingURL=utils-B3mfFSsc.js.map
