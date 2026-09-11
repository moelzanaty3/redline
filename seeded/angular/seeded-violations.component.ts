// DO NOT MERGE — Redline validation seed.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.
import { Component, Input, OnInit } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, mergeMap, of } from 'rxjs';

// SEED 1 [BLOCKER] (core/hardcoded-secrets) api key committed in source
const PARTNER_API_KEY = 'pk_live_51H8xQ2acme_prod_partner_key';

@Component({
  selector: 'app-seeded-violations',
  template: `
    <div [innerHTML]="trustedBio"></div>
    <!-- SEED 14 [HIGH] (angular/function-call-in-template) method called from a binding, so it runs every cycle -->
    <p>{{ formatTotal() }}</p>
    <!-- SEED 15 [HIGH] (angular/missing-trackby) ngFor over a re-fetched list with no trackBy -->
    <li *ngFor="let order of orders">{{ order.reference }}</li>
    <!-- SEED 16 [BLOCKER] (angular/open-redirect-navigation) routerLink bound to a query-param url -->
    <a [routerLink]="returnUrl">back</a>
  `,
})
export class SeededViolationsComponent implements OnInit {
  // SEED 2 [BLOCKER] (core/escape-hatch-types) any-typed input
  @Input() profile: any;

  orders: { reference: string }[] = [];
  trustedBio: unknown;
  returnUrl = '/';

  constructor(
    private readonly sanitizer: DomSanitizer,
    private readonly http: HttpClient,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    // SEED 3 [BLOCKER] (angular/bypass-security-trust) sanitiser switched off on user-supplied html
    this.trustedBio = this.sanitizer.bypassSecurityTrustHtml(this.profile.bio);

    // SEED 4 [BLOCKER] (angular/open-redirect-navigation) navigation target taken straight from a query param
    this.returnUrl = this.route.snapshot.queryParams['next'];
    this.router.navigateByUrl(this.returnUrl);

    // SEED 5 [BLOCKER] (angular/unsubscribed-subscription) subscription with no teardown
    this.http.get<{ reference: string }[]>('/api/orders').subscribe((orders) => {
      this.orders = orders;
    });

    // SEED 6 [BLOCKER] (angular/uncancelled-request-race) a request per keystroke, merged not switched
    this.route.queryParams
      .pipe(
        mergeMap((params) => this.http.get<{ reference: string }[]>(`/api/search?q=${params['q']}`)),
        // SEED 7 [HIGH] (angular/interceptor-swallows-error) failure returned as an empty success
        catchError(() => of([]))
      )
      .subscribe((orders) => (this.orders = orders));

    // SEED 8 [BLOCKER] (angular/timer-not-cleared) interval never cleared in ngOnDestroy
    setInterval(() => this.http.get('/api/heartbeat').subscribe(), 5000);

    // SEED 9 [BLOCKER] (core/customer-data-in-logs) msisdn written to the console
    console.log('loaded profile for', this.profile.msisdn);

    // SEED 10 [HIGH] (angular/unvalidated-route-param) route param coerced with no validation
    const accountId = +this.route.snapshot.params['accountId'];
    this.http.get(`/api/accounts/${accountId}`).subscribe();
  }

  formatTotal(): string {
    return this.orders.reduce((sum, o) => sum + o.reference.length, 0).toFixed(2);
  }

  // SEED 12 [HIGH] (angular/input-object-mutation) child writing to an object the parent owns
  markSeen(): void {
    this.profile.seen = true;
  }

  // SEED 13 [SUGGESTION] (angular/prefer-async-pipe) manual subscribe where the async pipe would do
  refresh(): void {
    this.http.get<{ reference: string }[]>('/api/orders').subscribe((o) => (this.orders = o));
  }

  authHeader(): string {
    return `Bearer ${PARTNER_API_KEY}`;
  }
}
