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
    
    // CHANGE HERE FOR EXTERNAL EXECUTION
    config: {
        _selectedPIData: null,
        _selectedPIValues: null,
        defaultSettings: {
            vendorField: 'MiddleName',
            columns: Ext.JSON.encode({
                'User': {show: true},
                'Cost Center': {show: false},
                'Vendor': {show: false},
                'Week Start': {show: false},
                'Date': {show: false},
                'Hours': {show: true}
            })
        }
    },
    
    stateful: true,
    stateEvents: ['updateData','columnsChosen','columnmoved','columnresize'],
    stateId: 'Rally.technicalservices.tstopleveltimereport.SelectedPIDatal.g',

    integrationHeaders : {
        name : "TSTopLevelTimeReport"
    },
    
    getState: function() {
        var me = this,
            state = null;

        state = {
            _selectedPIData: this._selectedPIData,
            _selectedPIValues: this._selectedPIValues,
            columns: this.columns
        };

        this.logger.log('getting state', state);
        return state;
    },
    
    applyState: function(state) {
        if (state) {
            this.logger.log('applying state', state);
            Ext.apply(this, state);
        }
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
            text: 'Choose Portfolio Item(s)',
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
                tpl: '<tpl>{msg}</tpl>'
            },
            { 
                xtype:'container',
                itemId:'pi_remove_button_container'
            }]
        });
                
        var spacer = container.add({ xtype: 'container', flex: 1});
        
        container.add({
            xtype:'tscolumnpickerbutton',
            margin: '0px 5px 0px 5px',
            cls: 'secondary big',
            columns: this._getColumns(),
            listeners: {
                scope: this,
                columnsChosen: function(button,columns) {
                    this.logger.log('columns:', columns);
                    this.columns = columns;
                    if ( this.down('rallygrid') ) {
                        
                        var store = this._getStore();
                        this.down('rallygrid').reconfigure(store, this.columns);
                        
                    }
                    
                    this.fireEvent('columnsChosen', columns);
                }
            }
        });
        
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
        //this._selectedPIData = null;
        this.logger.log('_launchPIPicker:', this._selectedPIValues);
        
        Ext.create('Rally.technicalservices.ChooserDialog', {
            artifactTypes: this.PortfolioItemNames,
            autoShow: true,
            multiple: true,
            title: 'Choose a PortfolioItem',
            selectedRefs: this._selectedPIValues,
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
                    displayName:'Team',
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
                'Team',
                'Owner',
                'State'
            ],
            fetchFields: ['ObjectID','FormattedID','Name'],
            listeners: {
                artifactchosen: function(dialog, selectedRecords){
                    this._selectedPIData = Ext.Array.map( selectedRecords, function(selectedRecord) {
                        return selectedRecord.getData();
                    });
                    
                    this._selectedPIValues = Ext.Array.map(selectedRecords, function(selectedRecord){
                        return selectedRecord.get('_ref');
                    });
                    this._displaySelectedPIMessage();
                },
                scope: this
            }
         });
             
    },
    
    _displaySelectedPIMessage: function() {
        var msg = "";
        
        if ( !Ext.isEmpty(this._selectedPIData) ) {
            if ( this._selectedPIData.length > 0 ) {
               msg = this._selectedPIData[0].FormattedID + ": " + this._selectedPIData[0].Name;
            }
            if ( this._selectedPIData.length == 2 ) {
                msg = msg + " ... and 1 other";
            }
            if ( this._selectedPIData.length > 2 ) {
                var extra_count = this._selectedPIData.length - 1;
                msg = msg + " ... and " + extra_count + " others";
            }
        }
        
        this.down('#pi_message').update({ msg: msg });
        var remove_button_container = this.down('#pi_remove_button_container');
        remove_button_container.removeAll();
        
        if ( !Ext.isEmpty(this._selectedPIData) && this._selectedPIData.length > 0 ) {
            remove_button_container.add({
                xtype:'rallybutton',
                itemId:'pi_remove_button',
                cls: 'secondary-action-btn',
                text: '<span class="icon-close"> </span>',
                listeners: {
                    scope: this,
                    click: this._clearSelectedPI
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
                this.logger.log('Create Rows');
                
                var rows = this._getRowsFromTime(time_values);
                this.logger.log('++++');
                
                this._addUpperLevelItems(rows).then({
                    scope: this,
                    success: function(results) {
                        this.rows = results;
                        this.setLoading("Creating Grid...");
                        
                        this.logger.log('Create Grid');
                        this._addGrid(this.down('#display_box'));
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
        var me = this;
        
        this.setLoading("Loading timesheets...");
        
        var tev_filters = [];
        
        if (this.down('#from_date_selector') ) {
            var start_date = Rally.util.DateTime.toIsoString( this.down('#from_date_selector').getValue(),false).replace(/T.*$/,'T00:00:00.000Z');
            tev_filters.push({property:'TimeEntryItem.WeekStartDate', operator: '>=', value:start_date});
        }
        
        if (this.down('#to_date_selector') ) {
            var start_date = Rally.util.DateTime.toIsoString( this.down('#to_date_selector').getValue(),true).replace(/T.*$/,'T00:00:00.000Z');
            tev_filters.push({property:'TimeEntryItem.WeekStartDate', operator: '<=', value:start_date});
        }
        
        // UNCOMMENT AND MODIFY TO RESTRICT TO VENDOR:
        // tev_filters.push({property:'TimeEntryItem.User.' + this.getSetting('vendorField'), value: 'VENDOR'});
        
        var config = {
            model:'TimeEntryValue',
            filters: tev_filters,
            fetch: ['WeekStartDate','ObjectID','DateVal','Hours',
                'TimeEntryItem','WorkProduct', 'WorkProductDisplayString',
                'Project','Feature','Task','TaskDisplayString','Parent',
                'User','UserName', 'CostCenter', 'FormattedID', 'Name', 
                this.getSetting('vendorField')
            ],
            sorters: [{ property:'CreationDate', direction:'ASC'}]
        };
        
        if (!Ext.isEmpty(me.projectContext)) {
            config.context = { 
                project: me.projectContext,
                projectScopeDown: true
            }
        }
        
        return TSUtilities.loadWsapiRecordsWithParallelPages(config);
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
                
                this.setLoading('Loading direct parents...');
                
                this._loadParentsFromOIDs(Ext.Array.unique(parent_oids), "Loading direct parents").then({
                    scope: this,
                    success: function(parents) {
                        me.setLoading(false);
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
        
        this.logger.log('_addUppperLevelItems', rows.length);
        
        var short_names = Ext.Array.map(me.PortfolioItemNames, function(piname){
            return piname.replace(/.*\//,'');
        });
        
        if ( short_names.length < 3 ) {
            return rows;
        }
        
        var level_2_name = me.PortfolioItemNames[1];
        var level_2_short_name = level_2_name.replace(/.*\//, '');
        var level_3_name = me.PortfolioItemNames[2];
        var level_3_short_name = level_3_name.replace(/.*\//, '');
        
        this.logger.log('-');
        var oids = Ext.Array.map(rows, function(row){
            return row[level_2_name] && row[level_2_name].ObjectID;
        });
        
        this.logger.log('--');
        
        var oids = Ext.Array.map(rows, function(row){
            return row[level_3_name] && row[level_3_name].ObjectID;
        });
                
        this.logger.log('---');
        // for stories with stories as parents, the feature doesn't
        // return its parent
        Ext.Array.each(rows, function(row) {
            if ( Ext.isEmpty(row[level_2_name]) && !Ext.isEmpty(row._ItemHierarchy)) {
                oids = Ext.Array.push(oids, row._ItemHierarchy);
            }
            if ( Ext.isEmpty(row[level_3_name]) && !Ext.isEmpty(row._ItemHierarchy)) {
                oids = Ext.Array.push(oids, row._ItemHierarchy);
            }
            
        });
        

        this.logger.log('about to load parents', oids.length);
        var unique_oids = Ext.Array.unique(oids);
        this.logger.log('   unique length:', unique_oids.length);
        
        this._loadParentsFromOIDs(unique_oids, 'Loading additional parents', true).then({
            scope: this,
            success: function(results) {
                var results_by_oid = {};
                me.setLoading('Calculating...');
                Ext.Array.each(results, function(result) {
                    if ( Ext.isArray(result) ) {
                        Ext.Array.each(result, function(r) {
                            if ( r && Ext.isFunction(r.get) ) {
                                results_by_oid[r.get('ObjectID')] = r;
                            } else {
                                console.log('-->', r);
                            }
                        });
                    } else {
                        if ( result && Ext.isFunction(result.get) ) {
                            results_by_oid[result.get('ObjectID')] = result;
                        } else {
                            console.log('-->', result);
                        }
                    }
                });
                
                this.logger.log('+');
                
                Ext.Array.each(rows, function(row){
                    var item = row[level_2_name];
                    
                    if ( item ) {                        
                        var item_oid = item.ObjectID;
                        row[level_2_name + "/idx"] = item_oid;
                        
                        if ( results_by_oid[item_oid] && results_by_oid[item_oid].get('Parent') ) {
                            row[level_3_name] = results_by_oid[item_oid].get('Parent');
                            row[level_3_name + "/idx"] = results_by_oid[item_oid].get('Parent').ObjectID;
                        }
                    }
                    
                    if ( !item && row._ItemHierarchy.length > 0 ) {
                        Ext.Array.each(row._ItemHierarchy, function(item_oid){
                            var parent = results_by_oid[item_oid];

                            if ( Ext.isEmpty(parent) ) { return; }
                            
                            if ( Ext.util.Format.lowercase(level_2_name) ==  parent.get('_type')) {
                                row[level_2_name] = parent.getData();
                                row[level_2_name + "/idx"] = parent.getData().ObjectID;
                            }
                            
                            if ( Ext.util.Format.lowercase(level_3_name) ==  parent.get('_type')) {
                                row[level_3_name] = parent.getData();
                                row[level_3_name + "/idx"] = parent.getData().ObjectID;
                            }
                        });
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
        this.setLoading("Applying PI Filter...");

        this.logger.log('_filterForPI');
        
        if ( Ext.isEmpty(this._selectedPIData) || this._selectedPIData.length === 0 ) { 
            return time_values;
        }
        //_TypeHierarchy
        var filtered_time_values = [];
        
        this.logger.log("Filtering on ", this._selectedPIData);
        
        Ext.Array.each(this._selectedPIData, function(selected_pi){
            var values = Ext.Array.filter(time_values, function(time_value) { 
                var item_hierarchy = time_value.get('_ItemHierarchy');

                return Ext.Array.contains(item_hierarchy, parseInt(selected_pi.ObjectID));
            },this);
            
            filtered_time_values = Ext.Array.merge(filtered_time_values, values);
        },this);
        return filtered_time_values;
    },
    
    _loadParentsFromOIDs: function(parent_oids, msg, search_everywhere) {
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        this.logger.log('_loadParentsFromOIDs', parent_oids.length);
        
        var filters = Ext.Array.map(parent_oids, function(oid){
            return { property:'ObjectID', value:oid }
        });
        
        var models = Ext.Array.merge(['HierarchicalRequirement'], this.PortfolioItemNames);
        
        var chunk_size = 100;
        var array_of_chunked_filters = [];
        
        while (filters.length > 0 ) {
            array_of_chunked_filters.push(filters.splice(0,chunk_size));
        }
        
        var promises = [];
        var page_count = array_of_chunked_filters.length;
        Ext.Array.each(array_of_chunked_filters, function(filters, page_index){
            var config = { 
                models:models, 
                filters: Rally.data.wsapi.Filter.or(filters), 
                fetch: ['FormattedID','Name','Parent','ObjectID'],
                enablePostGet: true
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
            promises.push(
                function() {
                    var percentage = parseInt( page_index * 100 / page_count, 10);
                    var text = msg || "Loading parent information";
                    me.setLoading(text + " (" + percentage + "%)");
                    return me._loadWsapiArtifacts(config); 
                }
            );
        });
        //
        CA.techservices.promise.ParallelThrottle.throttle(promises, 6, this).then({
        //Deft.Chain.sequence(promises,this).then({
            success: function(results) {
                me.setLoading(false);
                deferred.resolve(results);
            },
            failure: function(msg) {
                deferrred.reject(msg);
            }
        });
        
        return deferred.promise;
    },
    
    _addParentsToTime: function(time_values, lookback_records, parent_array){
        this.logger.log('_addParentsToTime');
        this.setLoading('Associating parent information...');
        // parent_array is an array of arrays
        var parents_by_parent_oid = {};
        Ext.Array.each(parent_array, function(parents,idx) {
            Ext.Array.each(parents, function(parent,jdx){
                parents_by_parent_oid[parent.get('ObjectID')] = parent;
            })
        });
        
        this.logger.log('.');
        
        var parents_by_oid = {};
        var item_hierarchy_by_oid = {};
        
        Ext.Array.each(lookback_records, function(record) {
            var oid_list = record.get('_ItemHierarchy');
            var oid = oid_list[oid_list.length-1];
            
            item_hierarchy_by_oid[oid] = oid_list;
            
            // find topmost parent in scope
            Ext.Array.each( oid_list, function(parent_oid) {
                if ( parents_by_parent_oid[parent_oid] ) {
                    parents_by_oid[oid] = parents_by_parent_oid[parent_oid];
                }
            },this,true);
        },this);

        this.logger.log('..');
        
        Ext.Array.each(time_values, function(time_value){
            var tei = time_value.get('TimeEntryItem');
            var wp = tei.WorkProduct;
            if ( !Ext.isEmpty(wp) ) {
                var oid = wp.ObjectID;
                time_value.set('_TopLevelParent', parents_by_oid[oid]);
                time_value.set('_ItemHierarchy', item_hierarchy_by_oid[oid] || []);
            } else {
                time_value.set('_TopLevelParent', "");
                time_value.set('_ItemHierarchy', []);
            }
        });
        
        this.logger.log('...');

        return time_values;
        
    },
    
    _getRowsFromTime: function(time_values) {
        var me = this;
        this.logger.log('_getRowsFromTime', time_values.length);
        
        var rows = [];
        
        Ext.Array.each( time_values, function(time_value){
            var user = time_value.get('TimeEntryItem').User;
            var user_story = time_value.get('TimeEntryItem').WorkProduct;
            var work_product = "";
            if ( !Ext.isEmpty(user_story) ) {
                work_product = user_story.FormattedID + ": " + user_story._refObjectName
            }
            var feature = null;
            
            
            var data = {
                '__SecretKey': 1,
                '_User': user.UserName,
                '_WeekStartString': time_value.get('TimeEntryItem').WeekStartDate.replace(/T.*$/,''),
                '_TopLevelParent': time_value.get('_TopLevelParent'),
                '_CostCenter': user['CostCenter'] || '',
                '_Vendor': user[me.getSetting('vendorField')] || '',
                '_WorkProduct': work_product ,
                '_Team': user_story && user_story.Project && user_story.Project._refObjectName,
                '_ItemHierarchy': time_value.get('_ItemHierarchy') || []
            };
            
            var short_names = Ext.Array.map(me.PortfolioItemNames, function(piname){
                return piname.replace(/.*\//,'');
            });
            
            Ext.Array.each(me.PortfolioItemNames, function(piname) {
                data[piname] = { ObjectID: -1};
                data[piname + "/idx"] = -1; // for sorting
            });
            
            Ext.Array.each(short_names, function(short_name) {
                data[short_name] = "";
            });
            
            if ( Ext.isEmpty(user_story) ) {
                //me.logger.log('no user story', time_value);
            } else {
                
                if ( me.PortfolioItemNames.length > 0 && !Ext.isEmpty(user_story[short_names[0]]) ) {
                    data[me.PortfolioItemNames[0]] = user_story[short_names[0]];
                    data[me.PortfolioItemNames[0] + '/idx'] = user_story[short_names[0]].ObjectID;
                }
                
                if ( me.PortfolioItemNames.length > 1 ) {
                    if ( data[me.PortfolioItemNames[0]] ) {
                        data[me.PortfolioItemNames[1]] = data[me.PortfolioItemNames[0]].Parent;
                    }
                }
    
                if ( me.PortfolioItemNames.length > 2 ) {
                    if ( data[me.PortfolioItemNames[1]] ) {
                        data[me.PortfolioItemNames[2]] = data[me.PortfolioItemNames[1]].Parent;
                    }
                }
            }
            
            rows.push( Ext.merge( data, time_value.getData() ) );
        });
        
        return rows;
    },
    
    _getStore: function() {
        var rows = this.rows;
        var total_hours = 0;
        
        this.display_rows = this._consolidateRows(rows);
        
        Ext.Array.each(this.display_rows, function(row) {
            var hours = row.Hours|| 0;
            total_hours = total_hours + ( 1000 * hours ); // shift decimal to the left so that decimal math can work
        });
                
        this.total_hours = total_hours / 1000;

        return Ext.create('Rally.data.custom.Store',{ 
            data: this.display_rows, 
            pageSize: 200,
            groupField: '__SecretKey'
        });
    },
    
    _getKey: function(display_fields, row) {
        var key_array = Ext.Array.map(display_fields, function(field) {
            if ( field == "Hours" ) {
                return "x";
            }
            var value = row[field];
            if ( Ext.isEmpty(value) ) {
                return "";
            }
            
            if ( Ext.isObject(value) && value.ObjectID ) {
                return value.ObjectID;
            }
            
            if ( Ext.isFunction(value.get) && value.get('ObjectID')) {
                return value.get('ObjectID');
            }
            return value;
        
        });
        return key_array.join(':');
    },
    
    _consolidateRows: function(rows) {
        var display_row_hash = {};
        var display_fields = Ext.Array.map( 
            Ext.Array.filter(this._getColumns(), function(column) {
                return ( !column.hidden );
            }),
            function(column) {
                return column.dataIndex;
            }
        );
        
        Ext.Array.each(rows, function(row) {
            var key = this._getKey(display_fields, row);
            if ( Ext.isEmpty(display_row_hash[key] ) ) {
                display_row_hash[key] =  Ext.clone(row);
                if ( display_row_hash[key].Hours > 0 ) {
                    var shifted = display_row_hash[key].Hours * 1000;
                    display_row_hash[key].Hours = shifted;
                }
                return;
            }
            var total_hours = display_row_hash[key].Hours || 0;
            var hours = row.Hours || 0;              
            var shifted_hours = 1000 * hours;// shift decimal to the left so that decimal math can work
            total_hours = total_hours + shifted_hours;
            
            display_row_hash[key].Hours = total_hours;
        },this);
        
        Ext.Object.each(display_row_hash, function(key,value){
            value.Hours = value.Hours / 1000;
        });
        
        return Ext.Object.getValues(display_row_hash);
    },
    
    _addGrid: function(container) {        
        
        var store = this._getStore();
        
        this.grid = container.add({
            xtype:'rallygrid',
            store: store,
            columnCfgs: this._getColumns(),
            enableEditing: false,
            showRowActionsColumn: false,
            enableBulkEdit: false,
            enableColumnHide: false,
            showPagingToolbar: true,
            pagingToolbarCfg: { pageSizes: [200] },
            sortableColumns: true,
            enableColumnMove: true,
            features: [{
                ftype: 'groupingsummary',
                startCollapsed: false,
                hideGroupedHeader: true,
                groupHeaderTpl: ' ',
                enableGroupingMenu: false,
                showSummaryRow: true
            }],
            listeners: {
                scope: this,
                columnmove: function(header_container,column,fromIdx,toIdx) {
                    var columns_by_text = {};
                    Ext.Array.each(this.columns, function(column) {
                        columns_by_text[column.text] = column;
                    });
                    
                    var columns_in_order = [];
                    
                    Ext.Array.each(header_container.getGridColumns( ), function(column){
                        columns_in_order.push(columns_by_text[column.text]);
                    });
                    
                    this.columns = columns_in_order;
                    
                    this.fireEvent('columnmoved',this.columns);
                    
                },
                columnresize: function(header_container,column,width){
                    Ext.Array.each(this.columns, function(col){
                        if ( col.text == column.text ) {
                            col.width = column.width;
                        }
                    });
                    
                    this.fireEvent('columnresize',this.columns);
                }
            }
        });
        
        this.setLoading(false);
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
        var columns = [];
        var me = this;
        
        Ext.Array.each(Ext.Array.clone(me.PortfolioItemNames).reverse(), function(pi_name){
            var short_name = pi_name.replace(/.*\//, '');
            var index = ( pi_name + '/idx' );
            
            columns.push({ 
                dataIndex: index, 
                text: short_name, 
                hidden: !me._getColumnShowSetting(short_name),
                renderer: function(v,m,r) {      
                    var item = r.get(pi_name);
                    if ( Ext.isEmpty(item) ) { return ""; }
                    if ( Ext.isEmpty(item.FormattedID) ) { return ""; }
                    
                    return item.FormattedID + ": " + item._refObjectName;
                }
            });
        });
        
        columns.push({ 
            dataIndex: '_TopLevelParent', 
            text: 'Top Level Work Item', 
            hidden: !me._getColumnShowSetting('Top Level Work Item'),
            selected: true,
            renderer: function(value) { 
                if ( Ext.isEmpty(value) ) { return '' }
                return value.get('FormattedID') + ": " + value.get('_refObjectName');
            }
        });

        columns =  Ext.Array.push(columns, [
            { 
                dataIndex: '_WorkProduct', 
                text: 'Story', 
                hidden: !me._getColumnShowSetting('Story')
            },
            { 
                dataIndex: '_Team', 
                text: 'Team', 
                hidden: !me._getColumnShowSetting('Team')
            },
            { 
                dataIndex: '_User', 
                text: 'User', 
                hidden: !me._getColumnShowSetting('User')
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
                    if ( Ext.isEmpty(value) ) { return ""; }
                    return me._getUTCDate(value); 
                }
            },
            { 
                dataIndex: 'Hours', 
                text: 'Hours',
                summaryRenderer: function() {
                    me.logger.log("total:", me.total_hours);
                    return me.total_hours;
                },
                hidden: false
            }
        ]);
        
        if ( !Ext.isEmpty(this.columns) ) {
            // columns saved as state lose their renderer functions
            var columns_by_text = {};
            Ext.Array.each(columns, function(column) {
                columns_by_text[column.text] = column;
            });
            
            // since columns can go away, show the word "TOTAL" in
            // the first visible column unless it has a summaryType
            var assigned_total_string_column = false;
            Ext.Array.each(this.columns, function(column){
                var cfg = columns_by_text[column.text];
                if ( cfg && cfg.renderer ) {
                    column.renderer = cfg.renderer;
                }
                                
                if ( cfg && !column.hidden && Ext.isEmpty(column.summaryType) ) {
                    if ( !assigned_total_string_column ) {
                        assigned_total_string_column = true;
                        column.summaryRenderer = function() {
                            return "TOTAL";
                        }
                    }
                }
                
                if ( cfg && cfg.summaryRenderer && cfg.dataIndex == "Hours" ) {
                    column.summaryRenderer = cfg.summaryRenderer;
                }
            });
            return this.columns;
        }
        
        this.columns = columns;
        
        return columns;
    },
    
    _export: function(){
        var me = this;
        this.logger.log('_export');
        
        var grid = this.down('rallygrid');
        var rows = this.display_rows;
        
        this.logger.log('number of rows:', rows.length);
        
        if ( !grid && !rows ) { return; }
        
        var filename = 'timesheet-report.csv';

        this.logger.log('saving file:', filename);
        
        this.setLoading("Generating CSV");
        Deft.Chain.sequence([
            function() { return Rally.technicalservices.FileUtilities.getCSVFromRows(this,grid,rows); } 
        ]).then({
            scope: this,
            success: function(csv){
                this.logger.log('got back csv ', csv.length);
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
        //this.logger.log("Starting load:",config.model);
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
        //this.logger.log("Starting load:",config);
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
