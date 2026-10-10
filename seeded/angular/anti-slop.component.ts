// DO NOT MERGE — Redline validation seed (anti-slop rules).
import { Component, EventEmitter, OnInit, Output, computed, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-anti-slop',
  // SEED 1 [HIGH] (angular/banana-out-of-box) inverted two-way binding never syncs
  template: '<input ([ngModel])="query"><input type="number" (input)="onInput($event)">',
})
export class AntiSlopComponent implements OnInit {
  readonly isAdmin = signal(false);
  first = 'Ada';
  last = 'Lovelace';
  // SEED 2 [HIGH] (angular/computed-reads-no-signal) reads plain fields, never updates
  fullName = computed(() => `${this.first} ${this.last}`);
  // SEED 3 [HIGH] (angular/output-native-event-name) fires the parent handler twice
  @Output() change = new EventEmitter<number>();

  // SEED 4 [HIGH] (angular/async-lifecycle-hook) Angular never awaits the hook
  async ngOnInit() {
    // SEED 5 [HIGH] (angular/uncalled-signal) the signal function is always truthy
    if (this.isAdmin) this.actions.push('delete');
    // SEED 6 [HIGH] (angular/injection-context-api-outside-context) NG0203 outside an injection context
    this.route.params.pipe(takeUntilDestroyed()).subscribe((p) => this.load(p['id']));
  }

  refresh() {
    // SEED 7 [HIGH] (angular/manual-lifecycle-call) re-runs every subscription the hook set up
    this.ngOnInit();
  }
}
