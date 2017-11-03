/**
 * Copyright (c) 2017 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { Atom } from '../structure'
import P from './properties'

namespace Predicates {
    export interface SetLike<A> { has(v: A): boolean }
    function isSetLike<A>(x: any): x is SetLike<A> { return !!x && !!x.has }

    export function eq<A>(p: Atom.Property<A>, value: A): Atom.Predicate { return l => p(l) === value; }
    export function lt<A>(p: Atom.Property<A>, value: A): Atom.Predicate { return l => p(l) < value; }
    export function lte<A>(p: Atom.Property<A>, value: A): Atom.Predicate { return l => p(l) <= value; }
    export function gt<A>(p: Atom.Property<A>, value: A): Atom.Predicate { return l => p(l) > value; }
    export function gte<A>(p: Atom.Property<A>, value: A): Atom.Predicate { return l => p(l) >= value; }

    export function inSet<A>(p: Atom.Property<A>, values: SetLike<A> | ArrayLike<A>): Atom.Predicate {
        if (isSetLike(values)) {
            return l => values.has(p(l));
        } else {
            if (values.length === 0) return P.constant.false;
            const set = new Set<A>();
            for (let i = 0; i < values.length; i++) set.add(values[i]);
            return l => set.has(p(l));
        }
    }

    export function and(...ps: Atom.Predicate[]): Atom.Predicate {
        switch (ps.length) {
            case 0: return P.constant.true;
            case 1: return ps[0];
            case 2: {
                const a = ps[0], b = ps[1];
                return l => a(l) && b(l);
            }
            case 3: {
                const a = ps[0], b = ps[1], c = ps[2];
                return l => a(l) && b(l) && c(l);
            }
            case 4: {
                const a = ps[0], b = ps[1], c = ps[2], d = ps[3];
                return l => a(l) && b(l) && c(l) && d(l);
            }
            case 5: {
                const a = ps[0], b = ps[1], c = ps[2], d = ps[3], e = ps[4];
                return l => a(l) && b(l) && c(l) && d(l) && e(l);
            }
            case 6: {
                const a = ps[0], b = ps[1], c = ps[2], d = ps[3], e = ps[4], f = ps[5];
                return l => a(l) && b(l) && c(l) && d(l) && e(l) && f(l);
            }
            default: {
                const count = ps.length;
                return l => {
                    for (let i = 0; i < count; i++) if (!ps[i]) return false;
                    return true;
                }
            }
        }
    }

    export function or(...ps: Atom.Predicate[]): Atom.Predicate {
        switch (ps.length) {
            case 0: return P.constant.true;
            case 1: return ps[0];
            case 2: {
                const a = ps[0], b = ps[1];
                return l => a(l) || b(l);
            }
            case 3: {
                const a = ps[0], b = ps[1], c = ps[2];
                return l => a(l) || b(l) || c(l);
            }
            case 4: {
                const a = ps[0], b = ps[1], c = ps[2], d = ps[3];
                return l => a(l) || b(l) || c(l) || d(l);
            }
            case 5: {
                const a = ps[0], b = ps[1], c = ps[2], d = ps[3], e = ps[4];
                return l => a(l) || b(l) || c(l) || d(l) || e(l);
            }
            case 6: {
                const a = ps[0], b = ps[1], c = ps[2], d = ps[3], e = ps[4], f = ps[5];
                return l => a(l) || b(l) || c(l) || d(l) || e(l) || f(l);
            }
            default: {
                const count = ps.length;
                return l => {
                    for (let i = 0; i < count; i++) if (ps[i]) return true;
                    return false;
                }
            }
        }
    }
}

export default Predicates