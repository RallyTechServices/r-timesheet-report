Ext.define("TSTopLevelTimeReport", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    
    layout: 'border', 
    items: [
        {xtype:'container', itemId:'selector_box', region: 'north',  layout: { type:'hbox' }},
        {xtype:'container', itemId:'display_box' , region: 'center', layout: { type: 'fit'} }
    ],
    
    projectContext: null,
    
    config: {
        _selectedPIData: null,
        defaultSettings: {
            vendorField: 'MiddleName',
            columns: Ext.JSON.encode({
                'User': {show: true},
                'Cost Center': {show: true},
                'Vendor': {show: true},
                'Week Start': {show: true},
                'Date': {show: true},
                'Hours': {show: true}
            })
        }
    },
    
    stateful: true,
    stateEvents: ['updateData'],
    stateId: 'Rally.technicalservices.tstopleveltimereport.SelectedPIData',

    integrationHeaders : {
        name : "TSTopLevelTimeReport"
    },
    
    getState: function() {
        var me = this,
            state = null;

        state = {
            _selectedPIData: this._selectedPIData
        };

        return state;
    },
    
    launch: function() {
        this._getPortfolioItemTypes().then({
            scope: this,
            success: function(types) {
                this.PortfolioItemNames = Ext.Array.map(types, function(type){
                    return type.get('TypePath');
                });
                
                this._addSelectors(this.down('#selector_box'));
                this._displaySelectedPIMessage();
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem starting up', msg);
            }
        });
    },
    
    _addSelectors: function(container) {
        container.removeAll();
        
        if ( this.isExternal() ) {
            container.add({
                xtype:'rallyprojectpicker',
                margin: '5 10 5 5',
                workspace: this.getContext().getWorkspaceRef(),
                fieldLabel: 'Project',
                labelAlign: 'top',
                listeners: {
                    scope: this,
                    change: function(cb) {
                        this.projectContext = cb.getValue();
                    }
                }
            });
        }
        
        var date_container = container.add({
            xtype:'container',
            layout: 'vbox'
        });
        
        var default_week = this._getBeginningOfWeek(new Date());
        
        var state_prefix = 'rally.techservices.' + this.getAppId();
        
        date_container.add({
            xtype:'rallydatefield',
            itemId:'from_date_selector',
            fieldLabel: 'From Week',
            value: default_week,
            stateful: true,
            stateId: state_prefix + ".from_date",
            stateEvents: ['change'],
            listeners: {
                scope: this,
                change: function(dp, new_value) {
                    if ( Ext.isEmpty(new_value) ) {
                        return;
                    }
                    var week_start = this._getBeginningOfWeek(new_value);
                    if ( week_start !== new_value ) {
                        dp.setValue(week_start);
                    }
                    if ( new_value.getDay() === 0 ) {
                        //this._updateData();
                    }
                }
            }
        });
        date_container.add({
            xtype:'rallydatefield',
            itemId:'to_date_selector',
            fieldLabel: 'Through Week',
            value: default_week,
            stateful: true,
            stateId: state_prefix + ".to_date",
            stateEvents: ['change'],
            listeners: {
                scope: this,
                change: function(dp, new_value) {
                    var week_start = this._getBeginningOfWeek(new_value);
                    if ( week_start !== new_value ) {
                        dp.setValue(week_start);
                    }
                    if ( new_value.getDay() === 0 ) {
                        //this._updateData();
                    }
                }
            }
        });
        
        var pi_container = container.add({
            xtype:'container',
            layout: 'vbox'
        });
        
        pi_container.add({
            xtype: 'rallybutton',
            text: 'Choose Portfolio Item',
            margin: '0px 5px 0px 5px',
            listeners: {
                scope: this,
                click: this._launchPIPicker
            }
        });
        
        pi_container.add({
            xtype: 'container',
            layout: 'hbox',
            items: [{
                xtype:'container',
                itemId: 'pi_message',
                margin: 7,
                tpl: '<tpl>{FormattedID}: {Name}</tpl>'
            },
            { 
                xtype:'container',
                itemId:'pi_remove_button_container'
            }]
        });
                
        var spacer = container.add({ xtype: 'container', flex: 1});
        container.add({
            xtype: 'rallybutton',
            text: 'Run',
            margin: '0px 5px 0px 5px',
            padding: 4,
            listeners: {
                scope: this,
                click: this._updateData
            }
        });
        
        container.add({
            xtype:'rallybutton',
            itemId:'export_button',
            cls: 'secondary',
            text: '<span class="icon-export"> </span>',
            disabled: true,
            listeners: {
                scope: this,
                click: function() {
                    this._export();
                }
            }
        });
        
        if ( this.isExternal() ) {
            container.add({type:'container', html: '&nbsp;&nbsp;&nbsp;&nbsp;'});
        }
    },
    
    _launchPIPicker: function() {
        var me = this;
        this._selectedPIData = null;
        
        Ext.create('Rally.technicalservices.ChooserDialog', {
            artifactTypes: this.PortfolioItemNames,
            autoShow: true,
            multiple: false,
            title: 'Choose PortfolioItem',
            filterableFields: [
                {
                    displayName: 'Formatted ID',
                    attributeName: 'FormattedID'
                },
                {
                    displayName: 'Name',
                    attributeName: 'Name'
                },
                {
                    displayName:'Project',
                    attributeName: 'Project.Name'
                },
                {
                    displayName:'Owner',
                    attributeName: 'Owner'
                }
            ],
            columns: [
                {
                    text: 'ID',
                    dataIndex: 'FormattedID'
                },
                'Name',
                'Project',
                'Owner',
                'State'
            ],
            fetchFields: ['ObjectID','FormattedID','Name'],
            listeners: {
                artifactchosen: function(dialog, selectedRecord){
                    this._selectedPIData = selectedRecord.getData();
                    this._displaySelectedPIMessage();
                },
                scope: this
            }
         });
             
    },
    
    _displaySelectedPIMessage: function() {
        this.down('#pi_message').update(this._selectedPIData);
        var remove_button_container = this.down('#pi_remove_button_container');
        remove_button_container.removeAll();
        
        if ( !Ext.isEmpty(this._selectedPIData) ) {
            remove_button_container.add({
                xtype:'rallybutton',
                itemId:'pi_remove_button',
                cls: 'secondary-action-btn',
                text: '<span class="icon-close"> </span>',
                listeners: {
                    scope: this,
                    clicK: this._clearSelectedPI
                }
            });
        }
            
    },
    
    _clearSelectedPI: function() {
        this._selectedPIData = null;
        this._displaySelectedPIMessage();
    },
    
    _updateData: function() {
        this.down('#display_box').removeAll();
        
        this.fireEvent('updateData', this, this._selectedPIData);
        
        Deft.Chain.pipeline([
            this._loadTime,
            this._loadHierarchyTree,
            this._filterForPI
        ],this).then({
            scope: this,
            success: function(time_values) {
                this.setLoading(false);
                
                var rows = this._getRowsFromTime(time_values);
                this._addUpperLevelItems(rows).then({
                    scope: this,
                    success: function(results) {
                        this._addGrid(this.down('#display_box'), results);
                    },
                    failure: function(msg){
                        Ext.Msg.alert('Problem adding associated data',msg);
                    }
                });
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem loading users with timesheets', msg);
            }
        });
    },
    
    _loadTime: function() {
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        
        this.setLoading("Loading timesheets...");
        
        var tev_filters = [{property:'ObjectID', operator: '>', value: 0 }];
        
        if (this.down('#from_date_selector') ) {
            var start_date = Rally.util.DateTime.toIsoString( this.down('#from_date_selector').getValue(),false).replace(/T.*$/,'T00:00:00.000Z');
            tev_filters.push({property:'TimeEntryItem.WeekStartDate', operator: '>=', value:start_date});
        }
        
        if (this.down('#to_date_selector') ) {
            var start_date = Rally.util.DateTime.toIsoString( this.down('#to_date_selector').getValue(),true).replace(/T.*$/,'T00:00:00.000Z');
            tev_filters.push({property:'TimeEntryItem.WeekStartDate', operator: '<=', value:start_date});
        }
        
        var tev_config = {
            model:'TimeEntryValue',
            limit: 1,
            pageSize: 1,
            filters: tev_filters,
            fetch: ['WeekStartDate','ObjectID','DateVal','Hours',
                'TimeEntryItem','WorkProduct', 'WorkProductDisplayString',
                'Project','Feature','Task','TaskDisplayString','Parent',
                'User','UserName', 'CostCenter', 'FormattedID', 'Name', 
                this.getSetting('vendorField')
            ]
        };
        
        var config_clone = Ext.clone(tev_config);
        
        Ext.create('Rally.data.wsapi.Store', tev_config).load({
            callback : function(records, operation, successful) {
                if (successful){
                    var page_size = 200;
                    
                    var total = operation.resultSet.totalRecords;
                    var page_count = Math.ceil(total / page_size);
                    
                    var promises = [];
                    
                    Ext.Array.each(_.range(1, page_count+1), function(page_index) {
                        var config = Ext.clone(config_clone);
                        
                        config.pageSize = page_size;
                        config.limit = page_size;
                        config.currentPage = page_index;
                        
                        if (!Ext.isEmpty(me.projectContext)) {
                            config.context = { 
                                project: me.projectContext,
                                projectScopeDown: true
                            }
                        }
                        promises.push(function() { return me._loadWsapiRecords(config); });
                    });
                    
                    Deft.Chain.parallel(promises,this).then({
                        success: function(results) { 
                            deferred.resolve(Ext.Array.flatten(results));
                        },
                        failure: function(msg) { 
                            deferred.reject(msg);
                        }
                    });
                    
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });

        return deferred.promise;
    },
    
    _loadHierarchyTree: function(time_values) {
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        
        this.setLoading("Loading associated items...");

        
        var oids = Ext.Array.map(time_values, function(time_value){
            var tei = time_value.get('TimeEntryItem');
            var workproduct = tei.WorkProduct;
            if ( !Ext.isEmpty(workproduct) ) {
                return workproduct.ObjectID;
            }
            return -1;
        });
        
        var unique_oids = Ext.Array.unique(oids);

        var config = {
            fetch: ['_ItemHierarchy'],
            filters: [
                { property: '__At', value:'current'},
                { property: '_TypeHierarchy', value: 'HierarchicalRequirement'},
                { property: 'ObjectID', operator:  'in', value: unique_oids }
            ]
        };
        
        this._loadLookbackRecords(config).then({
            scope: this,
            success: function(lookback_records) {
                var parent_oids = Ext.Array.flatten(
                    Ext.Array.map(lookback_records, function(record) {
                        return Ext.Array.map(record.get('_ItemHierarchy'), function(item) {
                            return item;
                        });
                    })
                );
                
                this._loadParentsFromOIDs(Ext.Array.unique(parent_oids)).then({
                    scope: this,
                    success: function(parents) {
                        var time = this._addParentsToTime(time_values, lookback_records, parents);
                        deferred.resolve(time);
                    },
                    failure: function(msg) {
                        deferred.reject(msg);
                    }
                });
            },
            failure: function(msg) { deferred.reject(msg); }
        });
        
        return deferred.promise;
    },
    
    _addUpperLevelItems: function(rows){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        
        var short_names = Ext.Array.map(me.PortfolioItemNames, function(piname){
            return piname.replace(/.*\//,'');
        });
        
        if ( short_names.length < 3 ) {
            return rows;
        }
        
        var level_2_name = me.PortfolioItemNames[1];
        var level_3_name = me.PortfolioItemNames[2];
        
        var oids = Ext.Array.map(rows, function(row){
            return row[me.PortfolioItemNames[1]] && row[me.PortfolioItemNames[1]].ObjectID;
        });
                
        me.setLoading('Loading Parent Tree...');

        this._loadParentsFromOIDs(Ext.Array.unique(oids), true).then({
            scope: this,
            success: function(results) {
                
                var results_by_oid = {};
                Ext.Array.each(results, function(result) {
                    results_by_oid[result.get('ObjectID')] = result;
                });
                
                Ext.Array.each(rows, function(row){
                    var item = row[level_2_name];
                    if ( item ) {
                        var item_oid = item.ObjectID;
                        
                        if ( results_by_oid[item_oid] ) {
                            row[level_3_name] = results_by_oid[item_oid].get('Parent');
                        }
                    }
                });
                
                me.setLoading(false);
                
                deferred.resolve(rows);
            },
            failure: function(msg){
                deferred.reject(msg);
            }
        });
        
        
        return deferred.promise;
    },
    
    _filterForPI: function(time_values) {
        var selected_pi = this._selectedPIData;
        this.setLoading("Applying filters...");

        
        if ( Ext.isEmpty(selected_pi) ) { 
            return time_values;
        }
        //_TypeHierarchy
        var filtered_time_values = Ext.Array.filter(time_values, function(time_value) { 
            var type_hierarchy = time_value.get('_TypeHierarchy');
            return Ext.Array.contains(type_hierarchy, parseInt(selected_pi.ObjectID));
        });
        
        return filtered_time_values;
    },
    
    _loadParentsFromOIDs: function(parent_oids, search_everywhere) {
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        var filters = Ext.Array.map(parent_oids, function(oid){
            return { property:'ObjectID', value:oid }
        });
        
        var models = Ext.Array.merge(['HierarchicalRequirement'], this.PortfolioItemNames);
        
        var chunk_size = 25;
        var array_of_chunked_filters = [];
        
        while (filters.length > 0 ) {
            array_of_chunked_filters.push(filters.splice(0,chunk_size));
        }
        
        var promises = [];
        Ext.Array.each(array_of_chunked_filters, function(filters){
            var config = { 
                models:models, 
                filters: Rally.data.wsapi.Filter.or(filters), 
                fetch: ['FormattedID','Name','Parent','ObjectID']
            };
            
            if (!Ext.isEmpty(me.projectContext)) {
                config.context = { 
                    project: me.projectContext,
                    projectScopeDown: true
                }
            }
                        
            if ( search_everywhere ) {
                config.context = { project: null };
            }
            promises.push(function() { return this._loadWsapiArtifacts(config); });
        });
        Deft.Chain.sequence(promises,this).then({
            success: function(results) {
                deferred.resolve(Ext.Array.flatten(results));
            },
            failure: function(msg) {
                deferrred.reject(msg);
            }
        });
        
        return deferred.promise;
    },
    
    _addParentsToTime: function(time_values, lookback_records, parents){
        
        var parents_by_parent_oid = {};
        Ext.Array.each(parents, function(parent){
            parents_by_parent_oid[parent.get('ObjectID')] = parent;
        });
        
        var parents_by_oid = {};
        var type_hierarchy_by_oid = {};
        
        Ext.Array.each(lookback_records, function(record) {
            var oid_list = record.get('_ItemHierarchy');
            var oid = oid_list[oid_list.length-1];
            
            type_hierarchy_by_oid[oid] = oid_list;
            
            // find topmost parent in scope
            Ext.Array.each( oid_list, function(parent_oid) {
                if ( parents_by_parent_oid[parent_oid] ) {
                    parents_by_oid[oid] = parents_by_parent_oid[parent_oid];
                }
            },this,true);
        },this);
                
        Ext.Array.each(time_values, function(time_value){
            var tei = time_value.get('TimeEntryItem');
            var wp = tei.WorkProduct;
            if ( !Ext.isEmpty(wp) ) {
                var oid = wp.ObjectID;
                time_value.set('_TopLevelParent', parents_by_oid[oid]);
                time_value.set('_TypeHierarchy', type_hierarchy_by_oid[oid] || []);
            } else {
                time_value.set('_TopLevelParent', "");
                time_value.set('_TypeHierarchy', []);
            }
        });
        
        return time_values;
        
    },
    
    _getRowsFromTime: function(time_values) {
        var me = this;
        return Ext.Array.map( time_values, function(time_value){
            var user = time_value.get('TimeEntryItem').User;
            var user_story = time_value.get('TimeEntryItem').WorkProduct;
            var feature = null;
            
            var data = {
                '_User': user,
                '_WeekStartString': time_value.get('TimeEntryItem').WeekStartDate.replace(/T.*$/,''),
                '_TopLevelParent': time_value.get('_TopLevelParent'),
                '_CostCenter': user['CostCenter'],
                '_Vendor': user[me.getSetting('vendorField')],
                '_WorkProduct': user_story
            };
            
            var short_names = Ext.Array.map(me.PortfolioItemNames, function(piname){
                return piname.replace(/.*\//,'');
            });
            
            if ( short_names.length > 0 ) {
                data[me.PortfolioItemNames[0]] = user_story[short_names[0]];
            }
            
            if ( short_names.length > 1 ) {
                data[me.PortfolioItemNames[1]] = null;
                if ( data[me.PortfolioItemNames[0]] ) {
                    data[me.PortfolioItemNames[1]] = data[me.PortfolioItemNames[0]].Parent;
                }
            }

            if ( short_names.length > 2 ) {
                data[me.PortfolioItemNames[2]] = null;
                if ( data[me.PortfolioItemNames[1]] ) {
                    data[me.PortfolioItemNames[2]] = data[me.PortfolioItemNames[1]].Parent;
                }
            }
            
            return Ext.merge( data, time_value.getData() );
        });
    },
    
    _addGrid: function(container, rows) {
        var store = Ext.create('Rally.data.custom.Store',{ 
            data: rows, 
            pageSize: 10000
        });
                
        container.add({
            xtype:'rallygrid',
            store: store,
            columnCfgs: this._getColumns(),
            enableEditing: false,
            showRowActionsColumn: false,
            enableBulkEdit: false,
            showPagingToolbar: false
        });
        
        this.down('#export_button').setDisabled(false);
    },
    
    _getColumnShowSetting: function(column_name) {
        var column_settings = this.getSetting('columns');
        if ( Ext.isString(column_settings) ) {
            column_settings = Ext.JSON.decode(column_settings);
        }
        
        return column_settings && column_settings[column_name] && column_settings[column_name]['show'];
    },
    
    _getColumns: function() {
        var me = this;
        var columns = [{ 
            dataIndex: '_TopLevelParent', 
            text: 'Top Level Work Item', 
            hidden: !me._getColumnShowSetting('Top Level Work Item'),
            renderer: function(value) { 
                if ( Ext.isEmpty(value) ) { return '' }
                return value.get('FormattedID') + ": " + value.get('_refObjectName');
            }
        }];
        
        Ext.Array.each(me.PortfolioItemNames, function(pi_name){
            var short_name = pi_name.replace(/.*\//, '');
            
            columns.push({ 
                dataIndex: pi_name, 
                text: short_name, 
                hidden: !me._getColumnShowSetting(short_name),
                renderer: function(v) {
                    if ( Ext.isEmpty(v) ) {
                        return "";
                    }
                    return v.FormattedID + ": " + v._refObjectName;
                }
            });
        });
        
        return Ext.Array.push(columns, [
            { 
                dataIndex: '_WorkProduct', 
                text: 'Story', 
                hidden: !me._getColumnShowSetting('Story'),
                renderer: function(v) {
                    if ( Ext.isEmpty(v) ) {
                        return "";
                    }
                    return v.FormattedID + ": " + v._refObjectName;
                } 
            },
            { 
                dataIndex: '_WorkProduct', 
                text: 'Project', 
                hidden: !me._getColumnShowSetting('Project'),
                renderer: function(v) {
                    if ( Ext.isEmpty(v) ) {
                        return "";
                    }
                    return v.Project._refObjectName;
                }
            },
            { 
                dataIndex: '_User', 
                text: 'User', 
                hidden: !me._getColumnShowSetting('User'),
                renderer: function(value) { 
                    return value.UserName; 
                }
            },
            { 
                dataIndex: '_CostCenter', 
                text:'Cost Center',
                hidden: !me._getColumnShowSetting('Cost Center')
            },
            { 
                dataIndex: '_Vendor', 
                text:'Vendor',
                hidden: !me._getColumnShowSetting('Vendor')
            },
            { 
                dataIndex: '_WeekStartString', 
                text: 'Week Start',
                hidden: !me._getColumnShowSetting('Week Start')
            },
            { 
                dataIndex: 'DateVal', 
                text: 'Date', 
                hidden: !this._getColumnShowSetting('Date'),
                renderer: function(value) { 
                    return me._getUTCDate(value); 
                }
            },
            { 
                dataIndex: 'Hours', 
                text: 'Hours',
                hidden: !this._getColumnShowSetting('Hours')
            }
        ]);
    },
    
    _export: function(){
        var grid = this.down('rallygrid');
        var me = this;
        
        if ( !grid ) { return; }
        
        var filename = Ext.String.format('timesheet-report.csv');

        this.setLoading("Generating CSV");
        Deft.Chain.sequence([
            function() { return Rally.technicalservices.FileUtilities.getCSVFromGrid(this,grid) } 
        ]).then({
            scope: this,
            success: function(csv){
                if (csv && csv.length > 0){
                    Rally.technicalservices.FileUtilities.saveCSVToFile(csv,filename);
                } else {
                    Rally.ui.notify.Notifier.showWarning({message: 'No data to export'});
                }
                
            }
        }).always(function() { me.setLoading(false); });
    },
    
    _getUTCDate: function(value) {
        return Rally.util.DateTime.toIsoString(value,true).replace(/T.*$/,'');
    },
    
    _loadWsapiRecords: function(config){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            model: 'Defect',
            fetch: ['ObjectID']
        };
        this.logger.log("Starting load:",config.model);
        Ext.create('Rally.data.wsapi.Store', Ext.Object.merge(default_config,config)).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
    _loadWsapiArtifacts: function(config) {
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            fetch: ['ObjectID']
        };
        this.logger.log("Starting load:",config);
        Ext.create('Rally.data.wsapi.artifact.Store', Ext.Object.merge(default_config,config)).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    var message = "";
                    if ( operation.error.errors ) {
                        message = operation.error.errors.join('. ');
                    }
                    deferred.reject(message);
                }
            }
        });
        return deferred.promise;
    },
    
    _loadLookbackRecords: function(config){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            removeUnauthorizedSnapshots: true,
            useHttpPost: true
        };
        this.logger.log("Starting load:",config);
        Ext.create('Rally.data.lookback.SnapshotStore', Ext.Object.merge(default_config,config)).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    var message = "Cannot load Lookback records";
                    if ( operation.error && operation.error.errors ) {
                        message = operation.error.errors.join('. ');
                    }
                    deferred.reject(message);
                }
            }
        });
        return deferred.promise;
    },
    
    _displayGrid: function(records){
        this.down('#display_box').add({
            xtype: 'rallygrid',
            store: store,
            columnCfgs: field_names
        });
    },
    
    _getPortfolioItemTypes: function() {
        var config = {
            model: 'TypeDefinition', 
            fetch: ["TypePath","Ordinal"],
            filters: [{property:'TypePath', operator:'contains', value:'PortfolioItem/'}],
            sorters: [{property:'Ordinal',direction:'ASC'}]
        };
        
        return this._loadWsapiRecords(config);
    },

    _filterOutExceptStrings: function(store) {
        var app = Rally.getApp();
        
        store.filter([{
            filterFn:function(field){ 
                var attribute_definition = field.get('fieldDefinition').attributeDefinition;
                var attribute_type = null;
                if ( attribute_definition ) {
                    attribute_type = attribute_definition.AttributeType;
                }
                if (  attribute_type == "BOOLEAN" ) {
                    return false;
                }
                if ( attribute_type == "STRING" || attribute_type == "RATING") {
                    //if ( !field.get('fieldDefinition').attributeDefinition.Constrained ) {
                        return true;
                    //}
                }
                
                //console.log(attribute_definition.ElementName, attribute_definition,  attribute_type);
                return false;
            } 
        }]);
    },
    
    getSettingsFields: function() {
        var me = this;
        
        var columns = this._getColumns();
        
        return [{
            name: 'vendorField',
            xtype: 'rallyfieldcombobox',
            fieldLabel: 'User Vendor Field',
            labelWidth: 75,
            labelAlign: 'left',
            minWidth: 200,
            margin: 10,
            autoExpand: false,
            alwaysExpanded: false,
            model: 'User',
            listeners: {
                ready: function(field_box) {
                    me._filterOutExceptStrings(field_box.getStore());
                }
            },
            readyEvent: 'ready'
        },
            
        {
            name: 'columns',
            readyEvent: 'ready',
            fieldLabel: 'Columns',
            margin: '5px 0 0 12px',
            xtype: 'tscolumnsettingsfield',
            gridColumns: columns,
            listeners: {
                ready: function() {
                    this.fireEvent('columnsettingsready');
                }
            },
            bubbleEvents: 'columnsettingsready'
        }];
    },
    
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _getBeginningOfWeek: function(js_date){
        this.logger.log("Get beginning from ", js_date);
        
        if ( Ext.isEmpty(js_date) ) { return null; }
        var start_of_week_here = Ext.Date.add(js_date, Ext.Date.DAY, -1 * js_date.getDay());
        return start_of_week_here;
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        // Ext.apply(this, settings);
        this.launch();
    }
});
