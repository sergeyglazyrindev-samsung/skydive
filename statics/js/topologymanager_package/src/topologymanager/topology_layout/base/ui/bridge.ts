import * as events from 'events';

import DataManager from '../data_manager';
import { LayoutUII, LayoutUI } from './layout';
import { NodeUII, NodeUI } from './node';
import { EdgeUII, EdgeUI } from './link';
import LayoutConfig from '../../config';
import { Node } from '../node/index';
import { Edge } from '../edge/index';
import { Group } from '../group/index';
import LayoutContext from './layout_context';

export interface LayoutBridgeUII {
    e: events.EventEmitter;
    config: LayoutConfig;
    useEventEmitter(e: events.EventEmitter): void;
    layoutContext: LayoutContext;
    selector: string;
    dataManager: DataManager;
    layoutUI: LayoutUII;
    nodeUI: NodeUII;
    edgeUI: EdgeUII;
    linkLabelStrategy: any;
    useLayoutUI(layoutUI: LayoutUII): void;
    useNodeUI(nodeUI: NodeUII): void;
    useEdgeUI(edgeUI: EdgeUII): void;
    useDataManager(dataManager: DataManager): void;
    useConfig(config: LayoutConfig): void;
    start(): void;
    setAutoExpand(autoExpand: boolean): void;
    setCollapseLevel(level: number): void;
    setMinimumCollapseLevel(level: number): void;
    useLinkLabelStrategy(linkLabelStrategy: any): void;
    remove(): void;
}

export interface LayoutBridgeUIConstructableI {
    new(selector: string): LayoutBridgeUII;
}

export class LayoutBridgeUI implements LayoutBridgeUII {
    edgeUI: EdgeUII;
    e: events.EventEmitter;
    selector: string;
    nodeUI: NodeUII;
    dataManager: DataManager;
    layoutUI: LayoutUII;
    config: LayoutConfig;
    initialized: boolean = false;
    collapseLevel: number = 1;
    minimumCollapseLevel: number = 1;
    autoExpand: boolean = false;
    invalidGraph: boolean = false;
    intervalId: any;
    linkLabelStrategy: any;
    constructor(selector: string) {
        this.selector = selector;
    }
    useEventEmitter(e: events.EventEmitter) {
        this.e = e;
    }
    useLinkLabelStrategy(linkLabelStrategy: any) {
        this.linkLabelStrategy = linkLabelStrategy;
    }
    setAutoExpand(autoExpand: boolean) {
        this.autoExpand = autoExpand;
    }
    setCollapseLevel(level: number) {
        this.collapseLevel = level;
    }
    setMinimumCollapseLevel(level: number) {
        this.minimumCollapseLevel = level;
    }
    useNodeUI(nodeUI: NodeUII) {
        this.nodeUI = nodeUI;
    }
    useEdgeUI(edgeUI: EdgeUII) {
        this.edgeUI = edgeUI;
    }
    useDataManager(dataManager: DataManager) {
        this.dataManager = dataManager;
    }
    useConfig(config: LayoutConfig) {
        this.config = config;
    }
    useLayoutUI(layoutUI: LayoutUII) {
        this.layoutUI = layoutUI;
    }
    start() {
        this.initialized = false;
        this.layoutUI.useLayoutContext(this.layoutContext);
        this.layoutUI.createRoot();
        this.edgeUI.useLayoutContext(this.layoutContext);
        this.edgeUI.createRoot(this.layoutUI.g);
        this.nodeUI.useLayoutContext(this.layoutContext);
        this.nodeUI.createRoot(this.layoutUI.g);
        this.layoutContext.subscribeToEvent('ui.tick', this.tick.bind(this));
        this.layoutContext.subscribeToEvent('ui.update', this.invalidateGraph.bind(this));
        this.layoutContext.subscribeToEvent('node.select', this.nodeSelected.bind(this));
        this.layoutContext.subscribeToEvent('node.updated', this.nodeUpdated.bind(this));
        this.layoutContext.subscribeToEvent('ui.node.highlight.byid', this.highlightNodeById.bind(this));
        this.layoutContext.subscribeToEvent('ui.node.unhighlight.byid', this.unhighlightNodeById.bind(this));
        this.layoutContext.subscribeToEvent('ui.node.emphasize.byid', this.emphasizeNodeById.bind(this));
        this.layoutContext.subscribeToEvent('ui.node.deemphasize.byid', this.deemphasizeNodeById.bind(this));
        this.layoutContext.subscribeToEvent('edge.select', this.edgeSelected.bind(this));
        this.layoutUI.start();
        this.intervalId = window.setInterval(() => {
            if (!this.invalidGraph) {
                return;
            }
            console.log('update graph');
            this.invalidGraph = false;
            this.update();
        }, 100);
        this.e.emit('ui.update');
        this.initialized = true;
    }
    remove() {
        if (this.intervalId) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
    get layoutContext(): LayoutContext {
        const context = new LayoutContext();
        context.getCollapseLevel = () => this.collapseLevel;
        context.getMinimumCollapseLevel = () => this.minimumCollapseLevel;
        context.isAutoExpand = () => this.autoExpand;
        context.dataManager = this.dataManager;
        context.e = this.e;
        context.config = this.config;
        context.linkLabelStrategy = this.linkLabelStrategy;
        return context;
    }
    tick() {
        this.nodeUI.tick();
    }
    update() {
        if (!this.initialized) {
            return;
        }
        this.nodeUI.update();
        this.layoutUI.restartsimulation();
    }
    nodeSelected(d: Node) {
        const activeNode = this.dataManager.nodeManager.getActive();
        const activeEdge = this.dataManager.edgeManager.getActive();
        if (activeEdge) {
            activeEdge.selected = false;
            this.e.emit('edge.select');
        }
        if (!activeNode || d.equalsTo(activeNode)) {
            return;
        }
        this.nodeUI.unselectNode(activeNode);
    }
    edgeSelected(d: Edge) {
        const activeEdge = this.dataManager.edgeManager.getActive();
        const activeNode = this.dataManager.nodeManager.getActive();
        if (activeNode) {
            activeNode.selected = false;
            this.e.emit('node.select');
        }
        if (!activeEdge || d.equalsTo(activeEdge)) {
            return;
        }
    }
    nodeUpdated(oldNode: Node, newNode: Node) {
        if (newNode.Metadata.Capture && newNode.Metadata.Capture.State === "active" && (!oldNode.Metadata.Capture || oldNode.Metadata.Capture.State !== "active")) {
            this.nodeUI.captureStarted(newNode);
        } else if (!newNode.Metadata.Capture && oldNode.Metadata.Capture) {
            this.nodeUI.captureStopped(newNode);
        }
        if (newNode.Metadata.Manager && !oldNode.Metadata.Manager) {
            this.nodeUI.managerSet(newNode);
        }
        if (newNode.Metadata.State !== oldNode.Metadata.State) {
            this.nodeUI.stateSet(newNode);
        }
    }
    highlightNodeById(nodeID: string) {
        const node = this.dataManager.nodeManager.getNodeById(nodeID);
        this.nodeUI.highlightNodeID(node);
    }
    unhighlightNodeById(nodeID: string) {
        const node = this.dataManager.nodeManager.getNodeById(nodeID);
        this.nodeUI.unhighlightNodeID(node);
    }
    deemphasizeNodeById(nodeID: string) {
        const node = this.dataManager.nodeManager.getNodeById(nodeID);
        this.nodeUI.deemphasizeNodeID(node);
    }
    emphasizeNodeById(nodeID: string) {
        const node = this.dataManager.nodeManager.getNodeById(nodeID);
        this.nodeUI.emphasizeNodeID(node);
    }
    invalidateGraph() {
        this.invalidGraph = true;
    }
    showNode(d: Node) {
        if (d.hasType("ofrule")) {
            return;
        }
        d.visible = true;
        this.e.emit('ui.update');
    }
    hideNode(d: Node) {
        if (d.hasType("ofrule")) {
            return;
        }
        d.visible = false;
    }
    collapseNode(d: Node, group: Group) {
        this.hideNode(d);
    }
    uncollapseNode(d: Node, group: any) {
        this.showNode(d);
    }
}
