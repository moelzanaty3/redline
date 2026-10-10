// DO NOT MERGE — Redline validation seed (anti-slop rules).
import { Pipe, PipeTransform } from '@angular/core';

// SEED 1 [HIGH] (angular/impure-pipe) re-runs on every change-detection cycle
@Pipe({ name: 'filterBy', standalone: true, pure: false })
export class FilterByPipe implements PipeTransform {
  transform(items: { name: string }[], q: string) { return items.filter((i) => i.name.includes(q)); }
}
