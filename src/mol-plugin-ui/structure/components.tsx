/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import * as React from 'react';
import { StructureComponentManager } from '../../mol-plugin-state/manager/structure/component';
import { StructureComponentRef, StructureRepresentationRef, StructureRef } from '../../mol-plugin-state/manager/structure/hierarchy-state';
import { PluginCommands } from '../../mol-plugin/commands';
import { State } from '../../mol-state';
import { ParamDefinition } from '../../mol-util/param-definition';
import { CollapsableControls, CollapsableState, PurePluginUIComponent } from '../base';
import { ActionMenu } from '../controls/action-menu';
import { ExpandGroup, IconButton, ToggleButton, Button } from '../controls/common';
import { ParameterControls } from '../controls/parameters';
import { UpdateTransformControl } from '../state/update-transform';
import { getStructureThemeTypes } from '../../mol-plugin-state/helpers/structure-representation-params';
import { StructureHierarchyManager } from '../../mol-plugin-state/manager/structure/hierarchy';
import { GenericEntryListControls } from './generic';

interface StructureComponentControlState extends CollapsableState {
    isDisabled: boolean
}

export class StructureComponentControls extends CollapsableControls<{}, StructureComponentControlState> {
    protected defaultState(): StructureComponentControlState {
        return { header: 'Representation', isCollapsed: false, isDisabled: false, brand: { name: 'Rpr', accent: 'blue' } };
    }

    componentDidMount() {
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, c => this.setState({
            description: StructureHierarchyManager.getSelectedStructuresDescription(this.plugin)
        }));
    }

    renderControls() {
        return <>
            <ComponentEditorControls />
            <ComponentListControls />
            <GenericEntryListControls />
        </>;
    }
}

interface ComponentEditorControlsState {
    action?: 'preset' | 'add' | 'options',
    isEmpty: boolean,
    isBusy: boolean,
    canUndo: boolean
}

class ComponentEditorControls extends PurePluginUIComponent<{}, ComponentEditorControlsState> {
    state: ComponentEditorControlsState = {
        isEmpty: true,
        isBusy: false,
        canUndo: false
    };

    get isDisabled() {
        return this.state.isBusy || this.state.isEmpty
    }

    componentDidMount() {
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, c => this.setState({
            action: this.state.action !== 'options' || c.structures.length === 0 ? void 0 : 'options',
            isEmpty: c.structures.length === 0
        }));
        this.subscribe(this.plugin.behaviors.state.isBusy, v => {
            this.setState({ isBusy: v, action: this.state.action !== 'options' ? void 0 : 'options' })
        });
        this.subscribe(this.plugin.state.data.events.historyUpdated, ({ state }) => {
            this.setState({ canUndo: state.canUndo });
        });
    }

    private toggleAction(action: ComponentEditorControlsState['action']) {
        return () => this.setState({ action: this.state.action === action ? void 0 : action });
    }

    togglePreset = this.toggleAction('preset');
    toggleAdd = this.toggleAction('add');
    toggleOptions = this.toggleAction('options');
    hideAction = () => this.setState({ action: void 0 });

    get presetControls() {
        return <ActionMenu items={this.presetActions} onSelect={this.applyPreset} />
    }

    get presetActions() {
        const pivot = this.plugin.managers.structure.component.pivotStructure;
        const providers = this.plugin.builders.structure.representation.getPresets(pivot?.cell.obj);
        return ActionMenu.createItems(providers, { label: p => p.display.name, category: p => p.display.group, description: p => p.display.description });
    }

    applyPreset: ActionMenu.OnSelect = item => {
        this.hideAction();

        if (!item) return;
        const mng = this.plugin.managers.structure;

        const { structures } = mng.hierarchy.selection;
        if (item.value === null) mng.component.clear(structures);
        else mng.component.applyPreset(structures, item.value as any);
    }

    undo = () => {
        const task = this.plugin.state.data.undo();
        if (task) this.plugin.runTask(task);
    }

    render() {
        const undoTitle = this.state.canUndo
            ? `Undo ${this.plugin.state.data.latestUndoLabel}`
            : 'Some mistakes of the past can be undone.';
        return <>
            <div className='msp-flex-row'>
                <ToggleButton icon='bookmarks' label='Preset' title='Apply a representation preset for the current structure(s).' toggle={this.togglePreset} isSelected={this.state.action === 'preset'} disabled={this.isDisabled} />
                <ToggleButton icon='plus' label='Add' title='Add a new representation component for a selection.' toggle={this.toggleAdd} isSelected={this.state.action === 'add'} disabled={this.isDisabled} />
                <ToggleButton icon='cog' label='' title='Options that are applied to all applicable representations.' style={{ flex: '0 0 40px', padding: 0 }} toggle={this.toggleOptions} isSelected={this.state.action === 'options'} disabled={this.isDisabled} />
                <IconButton className='msp-flex-item' flex='40px' onClick={this.undo} disabled={!this.state.canUndo || this.isDisabled} icon='back' title={undoTitle} />
            </div>
            {this.state.action === 'preset' && this.presetControls}
            {this.state.action === 'add' && <div className='msp-control-offset'>
                <AddComponentControls structures={this.plugin.managers.structure.component.currentStructures} onApply={this.hideAction} />
            </div>}
            {this.state.action === 'options' && <div className='msp-control-offset'><ComponentOptionsControls isDisabled={this.isDisabled} /></div>}
        </>;
    }
}

interface AddComponentControlsState {
    params: ParamDefinition.Params,
    values: StructureComponentManager.AddParams
}

interface AddComponentControlsProps {
    structures: ReadonlyArray<StructureRef>,
    onApply: () => void
}

class AddComponentControls extends PurePluginUIComponent<AddComponentControlsProps, AddComponentControlsState> {
    createState(): AddComponentControlsState {
        const params = StructureComponentManager.getAddParams(this.plugin);
        return { params, values: ParamDefinition.getDefaultValues(params) };
    }

    state = this.createState();

    apply = () => {
        this.plugin.managers.structure.component.add(this.state.values, this.props.structures);
        this.props.onApply();
    }

    paramsChanged = (values: any) => this.setState({ values })

    componentDidUpdate(prevProps: AddComponentControlsProps) {
        if (this.props.structures !== prevProps.structures) {
            this.setState(this.createState());
        }
    }

    render() {
        return <>
            <ParameterControls params={this.state.params} values={this.state.values} onChangeValues={this.paramsChanged} />
            <Button icon='plus' title='Use Selection and optional Representation to create a new Component.' className='msp-btn-commit msp-btn-commit-on' onClick={this.apply} style={{ marginTop: '1px' }}>
                Create Component
            </Button>
        </>;
    }
}

class ComponentOptionsControls extends PurePluginUIComponent<{ isDisabled: boolean }> {
    componentDidMount() {
        this.subscribe(this.plugin.managers.structure.component.events.optionsUpdated, () => this.forceUpdate());
    }

    update = (options: StructureComponentManager.Options) => this.plugin.managers.structure.component.setOptions(options)

    render() {
        return <ParameterControls params={StructureComponentManager.OptionsParams} values={this.plugin.managers.structure.component.state.options} onChangeValues={this.update} isDisabled={this.props.isDisabled} />;
    }
}

class ComponentListControls extends PurePluginUIComponent {
    componentDidMount() {
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, () => {
            this.forceUpdate()
        });
    }

    render() {
        const componentGroups = this.plugin.managers.structure.hierarchy.currentComponentGroups;
        if (componentGroups.length === 0) return null;

        return <div style={{ marginTop: '6px' }}>
            {componentGroups.map(g => <StructureComponentGroup key={g[0].cell.transform.ref} group={g} />)}
        </div>;
    }
}



type StructureComponentEntryActions = 'action' | 'remove'

class StructureComponentGroup extends PurePluginUIComponent<{ group: StructureComponentRef[] }, { action?: StructureComponentEntryActions }> {
    state = { action: void 0 as StructureComponentEntryActions | undefined }

    get pivot() {
        return this.props.group[0];
    }

    componentDidMount() {
        this.subscribe(this.plugin.events.state.cell.stateUpdated, e => {
            if (State.ObjectEvent.isCell(e, this.pivot.cell)) this.forceUpdate();
        });
    }

    toggleVisible = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        e.currentTarget.blur();
        this.plugin.managers.structure.component.toggleVisibility(this.props.group);
    }

    get colorByActions() {
        const mng = this.plugin.managers.structure.component;
        const repr = this.pivot.representations[0];
        const name = repr.cell.transform.params?.colorTheme.name;
        const themes = getStructureThemeTypes(this.plugin, this.pivot.cell.obj?.data);
        return ActionMenu.createItemsFromSelectOptions(themes, {
            value: o => () => mng.updateRepresentationsTheme(this.props.group, { color: o[0] as any }),
            selected: o => o[0] === name
        }) as ActionMenu.Item[];
    }

    get actions(): ActionMenu.Items {
        const mng = this.plugin.managers.structure.component;
        const ret: ActionMenu.Items = [
            [
                ActionMenu.Header('Add Representation'),
                ...StructureComponentManager.getRepresentationTypes(this.plugin, this.props.group[0])
                    .map(t => ActionMenu.Item(t[1], () => mng.addRepresentation(this.props.group, t[0])))
            ]
        ];

        if (this.pivot.representations.length > 0) {
            ret.push([
                ActionMenu.Header('Set Coloring', { isIndependent: true }),
                ...this.colorByActions
            ]);
        }

        if (mng.canBeModified(this.props.group[0])) {
            ret.push([
                ActionMenu.Header('Modify by Selection'),
                ActionMenu.Item('Include', () => mng.modifyByCurrentSelection(this.props.group, 'union'), { icon: 'union' }),
                ActionMenu.Item('Subtract', () => mng.modifyByCurrentSelection(this.props.group, 'subtract'), { icon: 'subtract' }),
                ActionMenu.Item('Intersect', () => mng.modifyByCurrentSelection(this.props.group, 'intersect'), { icon: 'intersect' })
            ]);
        }

        ret.push(ActionMenu.Item('Select This', () => mng.selectThis(this.props.group), { icon: 'set' }));

        return ret;
    }

    selectAction: ActionMenu.OnSelect = item => {
        if (!item) return;
        this.setState({ action: void 0 });
        (item?.value as any)();
    }

    get removeActions(): ActionMenu.Items {
        const ret = [
            ActionMenu.Item('Remove', () => this.plugin.managers.structure.hierarchy.remove(this.props.group, true), { icon: 'remove' })
        ];

        const reprs = this.pivot.representations;
        if (reprs.length === 0) {
            return ret;
        }

        ret.push(ActionMenu.Item(`Remove Representation${reprs.length > 1 ? 's' : ''}`, () => this.plugin.managers.structure.component.removeRepresentations(this.props.group), { icon: 'remove' }));

        return ret;
    }

    selectRemoveAction: ActionMenu.OnSelect = item => {
        if (!item) return;
        this.setState({ action: void 0 });
        (item?.value as any)();
    }

    toggleAction = () => this.setState({ action: this.state.action === 'action' ? void 0 : 'action' });
    toggleRemove = () => this.setState({ action: this.state.action === 'remove' ? void 0 : 'remove' });

    highlight = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        if (!this.props.group[0].cell.parent) return;
        PluginCommands.Interactivity.Object.Highlight(this.plugin, { state: this.props.group[0].cell.parent!, ref: this.props.group.map(c => c.cell.transform.ref) });
    }

    clearHighlight = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        PluginCommands.Interactivity.ClearHighlights(this.plugin);
    }

    focus = () => {
        let allHidden = true;
        for (const c of this.props.group) {
            if (!c.cell.state.isHidden) {
                allHidden = false;
                break;
            }
        }

        if (allHidden) {
            this.plugin.managers.structure.hierarchy.toggleVisibility(this.props.group, 'show');
        }

        this.plugin.managers.camera.focusSpheres(this.props.group, e => {
            if (e.cell.state.isHidden) return;
            return e.cell.obj?.data.boundary.sphere;
        });
    }

    get reprLabel() {
        // TODO: handle generic reprs.
        const pivot = this.pivot;
        if (pivot.representations.length === 0) return 'No repr.';
        if (pivot.representations.length === 1) return pivot.representations[0].cell.obj?.label;
        return `${pivot.representations.length} reprs`;
    }

    render() {
        const component = this.pivot;
        const cell = component.cell;
        const label = cell.obj?.label;
        const reprLabel = this.reprLabel;
        return <>
            <div className='msp-flex-row'>
                <Button noOverflow className='msp-control-button-label' title={`${label}. Click to focus.`} onClick={this.focus} onMouseEnter={this.highlight} onMouseLeave={this.clearHighlight} style={{ textAlign: 'left' }}>
                    {label}
                    <small className='msp-25-lower-contrast-text' style={{ float: 'right' }}>{reprLabel}</small>
                </Button>
                <IconButton onClick={this.toggleVisible} icon='visual-visibility' toggleState={!cell.state.isHidden} title={`${cell.state.isHidden ? 'Show' : 'Hide'} component`} small className='msp-form-control' flex />
                <IconButton onClick={this.toggleRemove} icon='remove' title='Remove' small toggleState={this.state.action === 'remove'} className='msp-form-control' flex />
                <IconButton onClick={this.toggleAction} icon='dot-3' title='Actions' toggleState={this.state.action === 'action'} className='msp-form-control' flex />
            </div>
            {this.state.action === 'remove' && <div style={{ marginBottom: '6px' }}>
                <ActionMenu items={this.removeActions} onSelect={this.selectRemoveAction} />
            </div>}
            {this.state.action === 'action' && <div className='msp-accent-offset'>
                <div style={{ marginBottom: '6px' }}>
                    <ActionMenu items={this.actions} onSelect={this.selectAction} noOffset />
                </div>
                <div style={{ marginBottom: '6px' }}>
                    {component.representations.map(r => <StructureRepresentationEntry group={this.props.group} key={r.cell.transform.ref} representation={r} />)}
                </div>
            </div>}
        </>;
    }
}

class StructureRepresentationEntry extends PurePluginUIComponent<{ group: StructureComponentRef[], representation: StructureRepresentationRef }> {
    remove = () => this.plugin.managers.structure.component.removeRepresentations(this.props.group, this.props.representation);
    toggleVisible = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        e.currentTarget.blur();
        this.plugin.managers.structure.component.toggleVisibility(this.props.group, this.props.representation);
    }

    componentDidMount() {
        this.subscribe(this.plugin.events.state.cell.stateUpdated, e => {
            if (State.ObjectEvent.isCell(e, this.props.representation.cell)) this.forceUpdate();
        });
    }

    update = (params: any) => this.plugin.managers.structure.component.updateRepresentations(this.props.group, this.props.representation, params);

    render() {
        const repr = this.props.representation.cell;
        return <div className='msp-representation-entry'>
            {repr.parent && <ExpandGroup header={`${repr.obj?.label || ''} Representation`} noOffset>
                <UpdateTransformControl state={repr.parent} transform={repr.transform} customHeader='none' customUpdate={this.update} noMargin />
            </ExpandGroup>}
            <IconButton onClick={this.remove} icon='remove' title='Remove' small className='msp-default-bg' style={{
                position: 'absolute', top: 0, right: '32px', lineHeight: '24px', height: '24px', textAlign: 'right', width: '44px', paddingRight: '6px'
            }} />
            <IconButton onClick={this.toggleVisible} toggleState={!this.props.representation.cell.state.isHidden} icon='visual-visibility' title='Remove' small className='msp-default-bg' style={{
                position: 'absolute', top: 0, right: 0, lineHeight: '24px', height: '24px', textAlign: 'right', width: '32px', paddingRight: '6px'
            }} />
        </div>;
    }
}