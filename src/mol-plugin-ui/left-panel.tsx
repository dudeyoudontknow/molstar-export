/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import * as React from 'react';
import { PluginUIComponent } from './base';
import { StateTree } from './state/tree';
import { IconButton, SectionHeader } from './controls/common';
import { StateObjectActions } from './state/actions';
import { StateTransform } from '../mol-state';
import { PluginCommands } from '../mol-plugin/commands';
import { ParameterControls } from './controls/parameters';
import { Canvas3DParams } from '../mol-canvas3d/canvas3d';
import { ParamDefinition as PD } from '../mol-util/param-definition';
import { StateSnapshots, RemoteStateSnapshots } from './state/snapshots';
import { HelpContent } from './viewport/help';
import { LeftPanelTabName } from '../mol-plugin/layout';
import { IconName } from './controls/icons';

export class LeftPanelControls extends PluginUIComponent<{}, { tab: LeftPanelTabName }> {
    state = { tab: this.plugin.behaviors.layout.leftPanelTabName.value };

    componentDidMount() {
        this.subscribe(this.plugin.behaviors.layout.leftPanelTabName, tab => {
            if (this.state.tab !== tab) this.setState({ tab });
            if (tab === 'none' && this.plugin.layout.state.regionState.left !== 'collapsed') {
                PluginCommands.Layout.Update(this.plugin, { state: { regionState: { ...this.plugin.layout.state.regionState, left: 'collapsed' } } });
            }
        });

        this.subscribe(this.plugin.state.data.events.changed, ({ state }) => {
            if (this.state.tab !== 'data') return;
            if (state.cells.size === 1) this.set('root');
        });
    }

    set = (tab: LeftPanelTabName) => {
        if (this.state.tab === tab) {
            this.setState({ tab: 'none' }, () => this.plugin.behaviors.layout.leftPanelTabName.next('none'));
            PluginCommands.Layout.Update(this.plugin, { state: { regionState: { ...this.plugin.layout.state.regionState, left: 'collapsed' } } });
            return;
        }

        this.setState({ tab }, () => this.plugin.behaviors.layout.leftPanelTabName.next(tab));
        if (this.plugin.layout.state.regionState.left !== 'full') {
            PluginCommands.Layout.Update(this.plugin, { state: { regionState: { ...this.plugin.layout.state.regionState, left: 'full' } } });
        }
    }

    tabs: { [K in LeftPanelTabName]: JSX.Element } = {
        'none': <></>,
        'root': <>
            <SectionHeader icon='home' title='Home' />
            <StateObjectActions state={this.plugin.state.data} nodeRef={StateTransform.RootRef} hideHeader={true} initiallyCollapsed={true} alwaysExpandFirst={true} />
            {this.plugin.spec.components?.remoteState !== 'none' && <RemoteStateSnapshots listOnly /> }
        </>,
        'data': <>
            <SectionHeader icon='flow-tree' title={<><RemoveAllButton /> State Tree</>} />
            <StateTree state={this.plugin.state.data} />
        </>,
        'states': <StateSnapshots />,
        'settings': <>
            <SectionHeader icon='settings' title='Plugin Settings' />
            <FullSettings />
        </>,
        'help': <>
            <SectionHeader icon='help-circle' title='Help' />
            <HelpContent />
        </>
    }

    render() {
        const tab = this.state.tab;

        // TODO: show "changed dot" next to the 'data' tab icon indicating the state has changed.
        return <div className='msp-left-panel-controls'>
            <div className='msp-left-panel-controls-buttons'>
                <IconButton icon='home' toggleState={tab === 'root'} transparent onClick={() => this.set('root')} title='Home' />
                {/* <IconButton icon='flow-tree' toggleState={tab === 'data'} onClick={() => this.set('data')} title='State Tree' /> */}
                <DataIcon set={this.set} />
                <IconButton icon='floppy' toggleState={tab === 'states'} transparent onClick={() => this.set('states')} title='Plugin State' />
                <IconButton icon='help-circle' toggleState={tab === 'help'} transparent onClick={() => this.set('help')} title='Help' />
                <div className='msp-left-panel-controls-buttons-bottom'>
                    <IconButton icon='settings' toggleState={tab === 'settings'} transparent onClick={() => this.set('settings')} title='Settings' />
                </div>
            </div>
            <div className='msp-scrollable-container'>
                {this.tabs[tab]}
            </div>
        </div>;
    }
}

class DataIcon extends PluginUIComponent<{ set: (tab: LeftPanelTabName) => void }, { changed: boolean }> {
    state = { changed: false };

    get tab() {
        return this.plugin.behaviors.layout.leftPanelTabName.value
    }

    componentDidMount() {
        this.subscribe(this.plugin.behaviors.layout.leftPanelTabName, tab => {
            if (this.tab === 'data') this.setState({ changed: false });
            else this.forceUpdate();
        });

        this.subscribe(this.plugin.state.data.events.changed, state => {
            if (this.tab !== 'data') this.setState({ changed: true });
        });
    }

    render() {
        return <IconButton
            icon='flow-tree' toggleState={this.tab === 'data'} transparent onClick={() => this.props.set('data')} title='State Tree'
            style={{ position: 'relative' }} extraContent={this.state.changed ? <div className='msp-left-panel-controls-button-data-dirty' /> : void 0} />;
    }
}

class FullSettings extends PluginUIComponent {
    private setSettings = (p: { param: PD.Base<any>, name: string, value: any }) => {
        PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: { [p.name]: p.value } });
    }

    componentDidMount() {
        this.subscribe(this.plugin.events.canvas3d.settingsUpdated, () => this.forceUpdate());
        this.subscribe(this.plugin.layout.events.updated, () => this.forceUpdate());

        this.subscribe(this.plugin.canvas3d!.camera.stateChanged, state => {
            if (state.radiusMax !== undefined || state.radius !== undefined) {
                this.forceUpdate()
            }
        })
    }

    icon(name: IconName, onClick: (e: React.MouseEvent<HTMLButtonElement>) => void, title: string, isOn = true) {
        return <IconButton icon={name} toggleState={isOn} onClick={onClick} title={title} />;
    }

    render() {
        return <>
            {this.plugin.canvas3d && <>
                <SectionHeader title='Viewport' />
                <ParameterControls params={Canvas3DParams} values={this.plugin.canvas3d.props} onChange={this.setSettings} />
            </>}
            <SectionHeader title='Behavior' />
            <StateTree state={this.plugin.state.behaviors} />
        </>
    }
}

export class RemoveAllButton extends PluginUIComponent<{ }> {
    componentDidMount() {
        this.subscribe(this.plugin.events.state.cell.created, e => {
            if (e.cell.transform.parent === StateTransform.RootRef) this.forceUpdate();
        });

        this.subscribe(this.plugin.events.state.cell.removed, e => {
            if (e.parent === StateTransform.RootRef) this.forceUpdate();
        });
    }

    remove = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        PluginCommands.State.RemoveObject(this.plugin, { state: this.plugin.state.data, ref: StateTransform.RootRef });
    }

    render() {
        const count = this.plugin.state.data.tree.children.get(StateTransform.RootRef).size;
        if (count === 0) return null;
        return <IconButton icon='remove' onClick={this.remove} title={'Remove All'} style={{ display: 'inline-block' }} small className='msp-no-hover-outline' transparent />;
    }
}
