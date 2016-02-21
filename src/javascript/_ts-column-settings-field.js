/**
 * Allows configuration of wip and schedule state mapping for kanban columns
 *
 *      @example
 *      Ext.create('Ext.Container', {
 *          items: [{
 *              xtype: 'kanbancolumnsettingsfield',
 *              value: {}
 *          }],
 *          renderTo: Ext.getBody().dom
 *      });
 *
 */
Ext.define('Rally.technicalservices.ColumnSettingsField', {
    extend: 'Ext.form.field.Base',
    alias: 'widget.tscolumnsettingsfield',

    requires: [
        'Rally.ui.combobox.ComboBox',
        'Rally.ui.TextField',
        'Rally.ui.combobox.FieldValueComboBox'
    ],

    fieldSubTpl: '<div id="{id}" class="settings-grid"></div>',

    width: 400,
    cls: 'column-settings',

    config: {
        /**
         * @cfg {Object}
         *
         * The column settings value for this field
         */
        value: undefined,
        /**
         * 
         * @cfg [{Object}] rallygrid column definition ({dataIndex:....}) 
         */
        gridColumns: []
    },

    onDestroy: function() {
        if (this._grid) {
            this._grid.destroy();
            delete this._grid;
        }
        this.callParent(arguments);
    },

    onRender: function() {
        this.callParent(arguments);

        var data = Ext.Array.map(this.gridColumns, this._recordToGridRow, this);
            
        this._store = Ext.create('Ext.data.Store', {
            fields: ['column', 'show'],
            data: data
        });
                
        this._grid = Ext.create('Rally.ui.grid.Grid', {
            autoWidth: true,
            renderTo: this.inputEl,
            columnCfgs: this._getColumnCfgs(),
            showPagingToolbar: false,
            showRowActionsColumn: false,
            enableRanking: false,
            store: this._store,
            editingConfig: {
                publishMessages: false
            }
        });
    },

    _getColumnCfgs: function() {
        var columns = [
            {
                text: 'Column',
                dataIndex: 'column',
                emptyCellText: 'None',
                flex: 2
            },
            {
                text: 'Show',
                dataIndex: 'show',
                flex: 1,
                renderer: function (value) {
                    return value === true ? 'Yes' : 'No';
                },
                editor: {
                    xtype: 'rallycombobox',
                    displayField: 'name',
                    valueField: 'value',
                    editable: false,
                    storeType: 'Ext.data.Store',
                    storeConfig: {
                        remoteFilter: false,
                        fields: ['name', 'value'],
                        data: [
                            {'name': 'Yes', 'value': true},
                            {'name': 'No', 'value': false}
                        ]
                    }
                }
            }
        ];
        return columns;
    },

    /**
     * When a form asks for the data this field represents,
     * give it the name of this field and the ref of the selected project (or an empty string).
     * Used when persisting the value of this field.
     * @return {Object}
     */
    getSubmitData: function() {
        var data = {};
        data[this.name] = Ext.JSON.encode(this._buildSettingValue());
        return data;
    },

    _buildSettingValue: function() {
        var columns = {};
        this._store.each(function(record) {
            if (record.get('show')) {
                columns[record.get('column')] = {
                    show: record.get('show')
                };
            }
        }, this);
        return columns;
    },

    getErrors: function() {
        var errors = [];
        if (this._storeLoaded && !Ext.Object.getSize(this._buildSettingValue())) {
            errors.push('At least one column must be shown.');
        }
        return errors;
    },

    setValue: function(value) {
        this.callParent(arguments);
        
        this._value = value;
    },

    _getColumnValue: function(columnName) {
        var value = this._value;
        if ( Ext.isString(value) ) {
            value = Ext.JSON.decode(value);
        }
        
        if ( Ext.isEmpty(value) || Ext.isEmpty(value[columnName])) {
            return null;
        }
        
        return value[columnName];
    },

    _recordToGridRow: function(grid_column) {
        var column_name = grid_column['text'];
        var show = this._getColumnValue(column_name) && this._getColumnValue(column_name)['show'];
        
        var column = {
            column: column_name,
            show: show
        };

        return column;
    }
});
