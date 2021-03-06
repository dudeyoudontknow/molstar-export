/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import * as React from 'react';
import { PluginUIComponent } from '../base';
import { ToggleButton, IconButton, Button } from '../controls/common';
import { ActionMenu } from '../controls/action-menu';
import { StructureElement, StructureProperties, Structure, Unit } from '../../mol-model/structure';
import { OrderedSet, SortedArray } from '../../mol-data/int';
import { UnitIndex } from '../../mol-model/structure/structure/element/element';
import { FocusEntry } from '../../mol-plugin-state/manager/structure/focus';
import { lociLabel } from '../../mol-theme/label';
import { FocusLoci } from '../../mol-plugin/behavior/dynamic/representation';
import { StateTransform } from '../../mol-state';
import { Binding } from '../../mol-util/binding';

interface StructureFocusControlsState {
    isBusy: boolean
    showAction: boolean
}

function addSymmetryGroupEntries(entries: Map<string, FocusEntry[]>, location: StructureElement.Location, unitSymmetryGroup: Unit.SymmetryGroup) {
    const idx = SortedArray.indexOf(location.unit.elements, location.element) as UnitIndex
    const base = StructureElement.Loci.extendToWholeResidues(
        StructureElement.Loci(location.structure, [
            { unit: location.unit, indices: OrderedSet.ofSingleton(idx) }
        ])
    )
    const name = StructureProperties.entity.pdbx_description(location).join(', ')

    for (const u of unitSymmetryGroup.units) {
        const loci = StructureElement.Loci(base.structure, [
            { unit: u, indices: base.elements[0].indices }
        ])

        let label = lociLabel(loci, { reverse: true, hidePrefix: true, htmlStyling: false, granularity: 'residue' })
        if (!label) label = lociLabel(loci, { hidePrefix: false, htmlStyling: false })
        if (unitSymmetryGroup.units.length > 1) {
            label += ` | ${loci.elements[0].unit.conformation.operator.name}`
        }
        const item: FocusEntry = { label, category: name, loci }

        if (entries.has(name)) entries.get(name)!.push(item)
        else entries.set(name, [item])
    }
}

function getFocusEntries(structure: Structure) {
    const entityEntries = new Map<string, FocusEntry[]>()
    const l = StructureElement.Location.create(structure)

    for (const ug of structure.unitSymmetryGroups) {
        l.unit = ug.units[0]
        l.element = ug.elements[0]
        const entityType = StructureProperties.entity.type(l)
        const isMultiChain = Unit.Traits.is(l.unit.traits, Unit.Trait.MultiChain)
        const isPolymer = entityType === 'non-polymer'
        const isBranched = entityType === 'branched'

        if (isPolymer && !isMultiChain) {
            addSymmetryGroupEntries(entityEntries, l, ug)
        } else if (isBranched || (isPolymer && isMultiChain)) {
            const u = l.unit
            const { index: residueIndex } = u.model.atomicHierarchy.residueAtomSegments
            let prev = -1
            for (let i = 0, il = u.elements.length; i < il; ++i) {
                const eI = u.elements[i]
                const rI = residueIndex[eI]
                if(rI !== prev) {
                    l.element = eI
                    addSymmetryGroupEntries(entityEntries, l, ug)
                    prev = rI
                }
            }
        }
    }

    const entries: FocusEntry[] = []
    entityEntries.forEach((e, name) => {
        if (e.length === 1) {
            entries.push({ label: `${name}: ${e[0].label}`, loci: e[0].loci })
        } else {
            entries.push(...e)
        }
    })

    return entries
}

export class StructureFocusControls extends PluginUIComponent<{}, StructureFocusControlsState> {
    state = { isBusy: false, showAction: false }

    componentDidMount() {
        this.subscribe(this.plugin.managers.structure.focus.behaviors.current, c => {
            this.forceUpdate();
        });

        this.subscribe(this.plugin.managers.structure.focus.events.historyUpdated, c => {
            this.forceUpdate();
        });

        this.subscribe(this.plugin.behaviors.state.isBusy, v => {
            this.setState({ isBusy: v, showAction: false })
        })
    }

    get isDisabled() {
        return this.state.isBusy || this.actionItems.length === 0
    }

    get actionItems() {
        const historyItems: ActionMenu.Items[] = []
        const { history } = this.plugin.managers.structure.focus
        if (history.length > 0) {
            historyItems.push([
                ActionMenu.Header('History', { description: 'Previously focused on items.' }),
                ...ActionMenu.createItems(history, {
                    label: f => f.label,
                    description: f => {
                        return f.category && f.label !== f.category
                            ? `${f.category} | ${f.label}`
                            : f.label
                    }
                })
            ])
        }

        const presetItems: ActionMenu.Items[] = []
        const { structures } = this.plugin.managers.structure.hierarchy.selection;
        for (const s of structures) {
            const d = s.cell.obj?.data
            if (d) {
                const entries = getFocusEntries(d)
                if (entries.length > 0) {
                    presetItems.push([
                        ActionMenu.Header(d.label, { description: d.label }),
                        ...ActionMenu.createItems(entries, {
                            label: f => f.label,
                            category: f => f.category,
                            description: f => f.label
                        })
                    ])
                }
            }
        }
        if (presetItems.length === 1) {
            const item = presetItems[0] as ActionMenu.Items[]
            const header = item[0] as ActionMenu.Header
            header.initiallyExpanded = true
        }

        const items: ActionMenu.Items[] = []
        if (presetItems.length > 0) items.push(...presetItems)
        if (historyItems.length > 0) items.push(...historyItems)

        return items
    }

    selectAction: ActionMenu.OnSelect = (item, e) => {
        if (!item || !this.state.showAction) {
            this.setState({ showAction: false });
            return;
        }
        const f = item.value as FocusEntry
        if (e?.shiftKey) {
            this.plugin.managers.structure.focus.addFromLoci(f.loci)
        } else {
            this.plugin.managers.structure.focus.set(f)
        }
    }

    toggleAction = () => this.setState({ showAction: !this.state.showAction })

    focus = () => {
        const { current } = this.plugin.managers.structure.focus
        if (current) this.plugin.managers.camera.focusLoci(current.loci);
    }

    clear = () => {
        this.plugin.managers.structure.focus.clear();
        this.plugin.managers.camera.reset();
    }

    highlightCurrent = () => {
        const { current } = this.plugin.managers.structure.focus
        if (current) this.plugin.managers.interactivity.lociHighlights.highlightOnly({ loci: current.loci }, false);
    }

    clearHighlights = () => {
        this.plugin.managers.interactivity.lociHighlights.clearHighlights()
    }

    getToggleBindingLabel() {
        const t = this.plugin.state.behaviors.transforms.get(FocusLoci.id) as StateTransform<typeof FocusLoci>;
        if (!t) return '';
        const binding = t.params?.bindings.clickFocus;
        if (!binding || Binding.isEmpty(binding)) return '';
        return Binding.formatTriggers(binding);
    }

    render() {
        const { current } = this.plugin.managers.structure.focus;
        const label = current?.label || 'Nothing Focused';

        let title = 'Click to Center Camera';
        if (!current) {
            title = 'Select focus using the menu';
            const binding = this.getToggleBindingLabel();
            if (binding) {
                title += `\nor use '${binding}' on element`;
            }
        }

        return <>
            <div className='msp-flex-row'>
                <Button noOverflow onClick={this.focus} title={title} onMouseEnter={this.highlightCurrent} onMouseLeave={this.clearHighlights} disabled={this.isDisabled || !current}
                    style={{ textAlignLast: current ? 'left' : void 0 }}>
                    {label}
                </Button>
                {current && <IconButton onClick={this.clear} icon='cancel' title='Clear' className='msp-form-control' flex disabled={this.isDisabled} />}
                <ToggleButton icon='book-open' title='Select a focus target to center on an show its surroundings. Hold shift to focus on multiple targets.' toggle={this.toggleAction} isSelected={this.state.showAction} disabled={this.isDisabled} style={{ flex: '0 0 40px', padding: 0 }} />
            </div>
            {this.state.showAction && <ActionMenu items={this.actionItems} onSelect={this.selectAction} />}
        </>;
    }
}