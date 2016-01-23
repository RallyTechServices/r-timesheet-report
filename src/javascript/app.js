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
    
    config: {
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

    integrationHeaders : {
        name : "TSTopLevelTimeReport"
    },

    launch: function() {
        this._getPortfolioItemTypes().then({
            scope: this,
            success: function(types) {
                this.PortfolioItemNames = Ext.Array.map(types, function(type){
                    return type.get('TypePath');
                });
                
                this._addSelectors(this.down('#selector_box'));
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem starting up', msg);
            }
        });
    },
    
    _addSelectors: function(container) {
        container.removeAll();
                
        var date_container = container.add({
            xtype:'container',
            layout: 'vbox'
        });
        
        var week_start = this._getBeginningOfWeek(Rally.util.DateTime.add(new Date(), 'week', -3));
        
        date_container.add({
            xtype:'rallydatefield',
            itemId:'from_date_selector',
            fieldLabel: 'From Week',
            value: week_start,
            listeners: {
                scope: this,
                change: function(dp, new_value) {
                    var week_start = this._getBeginningOfWeek(new_value);
                    if ( week_start !== new_value ) {
                        dp.setValue(week_start);
                    }
                    if ( new_value.getDay() === 0 ) {
                        this._updateData();
                    }
                }
            }
        });
        
        date_container.add({
            xtype:'rallydatefield',
            itemId:'to_date_selector',
            fieldLabel: 'Through Week',
            listeners: {
                scope: this,
                change: function(dp, new_value) {
                    var week_start = this._getBeginningOfWeek(new_value);
                    if ( week_start !== new_value ) {
                        dp.setValue(week_start);
                    }
                    if ( new_value.getDay() === 0 ) {
                        this._updateData();
                    }
                }
            }
        }).setValue(new Date());
        
        container.add({
            xtype: 'rallybutton',
            text: 'Choose Portfolio Item',
            margin: '0px 5px 0px 5px',
            listeners: {
                scope: this,
                click: this._launchPIPicker
            }
        });
        
        var spacer = container.add({ xtype: 'container', flex: 1});
        
        if ( this.isExternal() ) {
            container.add({type:'container', html: '&nbsp;&nbsp;&nbsp;&nbsp;'});
        }
    },
    
    _launchPIPicker: function() {
        var me = this;
        this._selectedPI = null;
        Ext.create('Rally.ui.dialog.ArtifactChooserDialog', {
            artifactTypes: ['portfolioitem'],
            autoShow: true,
            height: 250,
            title: 'Choose Portfolio Item',
            multiple: false,
            listeners: {
                artifactchosen: function(dialog, selectedRecord){
                    this._selectedPI = selectedRecord;
                    me._updateData();
                },
                scope: this
            }
         });
    },
    
    _updateData: function() {
        this.down('#display_box').removeAll();
        
        Deft.Chain.pipeline([
            this._loadTime,
            this._loadTopLevelItems,
            this._filterForPI
        ],this).then({
            scope: this,
            success: function(time_values) {
                this.setLoading(false);
                
                var rows = this._getRowsFromTime(time_values);
                this._addGrid(this.down('#display_box'), rows);
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem loading users with timesheets', msg);
            }
        });
    },
    
    _loadTime: function() {
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
            limit: 'Infinity',
            filters: tev_filters,
            
            fetch: ['WeekStartDate','ObjectID','DateVal','Hours',
                'TimeEntryItem','WorkProduct', 'WorkProductDisplayString',
                'Project','Feature','Task','TaskDisplayString',
                'User','UserName', 'CostCenter', 'FormattedID', 'Name', 
                this.getSetting('vendorField')
            ]
        };
        
       return this._loadWsapiRecords(tev_config);
    },
    
    _loadTopLevelItems: function(time_values) {
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
    
    _filterForPI: function(time_values) {
        var selected_pi = this._selectedPI;
        this.setLoading("Applying filters...");

        
        if ( Ext.isEmpty(selected_pi) ) { 
            return time_values;
        }
        //_TypeHierarchy
        var filtered_time_values = Ext.Array.filter(time_values, function(time_value) { 
            var type_hierarchy = time_value.get('_TypeHierarchy');
            return Ext.Array.contains(type_hierarchy, parseInt(selected_pi.get('ObjectID')));
        });
        
        return filtered_time_values;
    },
    
    _loadParentsFromOIDs: function(parent_oids) {
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
                fetch: ['FormattedID','Name']
            };
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
            
            if ( user_story ) {
                feature = user_story.Feature;
            }
            return Ext.create('TSTimesheetFinanceRow',
                Ext.merge({
                    '_User': user,
                    '_WeekStartString': time_value.get('TimeEntryItem').WeekStartDate.replace(/T.*$/,''),
                    '_TopLevelParent': time_value.get('_TopLevelParent'),
                    '_CostCenter': user['CostCenter'],
                    '_Vendor': user[me.getSetting('vendorField')],
                    '_WorkProduct': user_story,
                    '_Feature': feature
                },
                time_value.getData())
            );
        });
    },
    
    _addGrid: function(container, rows) {
        this.logger.log('_addGrid', rows);
        var store = Ext.create('Rally.data.custom.Store',{ 
            data: rows, 
            model: 'TSTimesheetFinanceRow',
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
                
        return [
            { 
                dataIndex: '_TopLevelParent', 
                text: 'Top Level Work Item', 
                hidden: !this._getColumnShowSetting('Top Level Work Item'),
                renderer: function(value) { 
                    if ( Ext.isEmpty(value) ) { return '' }
                    return value.get('FormattedID');
                }
            },
            { 
                dataIndex: '_Feature', 
                text: 'Feature', 
                hidden: !this._getColumnShowSetting('Feature'),
                renderer: function(v) {
                    if ( Ext.isEmpty(v) ) {
                        return "";
                    }
                    return v.FormattedID;
                }
            },
            { 
                dataIndex: '_WorkProduct', 
                text: 'Story ID', 
                hidden: !this._getColumnShowSetting('Story ID'),
                renderer: function(v) {
                    if ( Ext.isEmpty(v) ) {
                        return "";
                    }
                    return v.FormattedID;
                } 
            },
            { 
                dataIndex: '_WorkProduct', 
                text: 'Story Name', 
                hidden: !this._getColumnShowSetting('Story Name'),
                renderer: function(v) {
                    if ( Ext.isEmpty(v) ) {
                        return "";
                    }
                    return v.Name;
                }
            },
            { 
                dataIndex: '_WorkProduct', 
                text: 'Project', 
                hidden: !this._getColumnShowSetting('Project'),
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
                hidden: !this._getColumnShowSetting('User'),
                renderer: function(value) { 
                    return value.UserName; 
                }
            },
            { 
                dataIndex: '_CostCenter', 
                text:'Cost Center',
                hidden: !this._getColumnShowSetting('Cost Center')
            },
            { 
                dataIndex: '_Vendor', 
                text:'Vendor',
                hidden: !this._getColumnShowSetting('Vendor')
            },
            { 
                dataIndex: '_WeekStartString', 
                text: 'Week Start',
                hidden: !this._getColumnShowSetting('Week Start')
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
        ];
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
