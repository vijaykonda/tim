console.log('requiring GridHeader.js')
'use strict';

import React, { Component, PropTypes } from 'react'
import {
  TouchableOpacity,
  View,
  Text,
} from 'react-native'

import constants from '@tradle/constants'
import Icon from 'react-native-vector-icons/Ionicons'
// import extend from 'extend'
import _ from 'lodash'
import reactMixin from 'react-mixin'
import { makeResponsive } from 'react-native-orient'

import {Column as Col, Row} from 'react-native-flexbox-grid'
import utils, {
  translate
} from '../utils/utils'
import StyleSheet from '../StyleSheet'

const MONEY = constants.TYPES

class GridHeader extends Component {
  props: {
    navigator: PropTypes.object.isRequired,
    modelName: PropTypes.string.isRequired,
    gridCols: PropTypes.array.isRequired,
    multiChooser: PropTypes.boolean,
    isSmallScreen: PropTypes.boolean,
    checkAll: PropTypes.func,
    sort: PropTypes.func
    // backlinkList: PropTypes.array
  };
  constructor(props) {
    super(props);

    let {resource, modelName, multiChooser, gridCols} = this.props
    let model = utils.getModel(modelName)

    let size = gridCols ? gridCols.length : 1
    this.limit = 20 //this.isSmallScreen ? 20 : 40
    this.state = {
      isChecked: false
    };
  }
  render() {
    let { modelName, isSmallScreen } = this.props
    let model = utils.getModel(modelName)
    let props = model.properties
    let gridCols = this.props.gridCols
    if (!gridCols)
      return <View />

    let size
    if (gridCols) {
      let vCols = gridCols.filter((c) => props[c].type !== 'array')
      gridCols = vCols
      size = Math.min(gridCols.length, 12)
      if (size < gridCols.length)
        gridCols.splice(size, gridCols.length - size)
    }
    else
      size = 1

    let smCol = isSmallScreen ? size/2 : 1
    if (this.props.multiChooser)
      size++
    let {sortProperty, order} = this.state
    let cols = gridCols.map((p) => {
      let colStyle
      if (sortProperty  &&  sortProperty === p) {
        let asc = order[sortProperty]
        colStyle = [styles.col, asc ? styles.sortAscending : styles.sortDescending]
      }
      else
        colStyle = styles.col
      let prop = props[p]
      let textStyle
      if (prop.type === 'number' || prop.type === 'date' || prop.ref === MONEY)
        textStyle = {alignSelf: 'flex-end', paddingRight: 10}
      else
        textStyle = {}
      return <Col sm={smCol} md={1} lg={1} style={colStyle} key={p}>
                <TouchableOpacity onPress={() => this.props.sort(p)}>
                  <Text style={[styles.cell, textStyle]}>
                    {props[p].title.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              </Col>
    })
    if (this.props.multiChooser) {
      // let checkIcon
      // let isChecked = this.state.isChecked
      // let colName
      // if (isChecked) {
      //   checkIcon = 'ios-checkmark-circle-outline'
      //   colName = translate('Uncheck')
      // }
      // else {
      //   checkIcon = 'ios-radio-button-off'
      //   colName = translate('Check')
      // }
      // cols.push(<Col sm={smCol} md={1} lg={1} style={styles.col} key={'check'}>
      //             <Text style={styles.checkCell}>{colName}</Text>
      //             <TouchableOpacity onPress={this.checkAll.bind(this)}>
      //               <Icon name={checkIcon}  size={30}  color='#7AAAc3' style={{paddingRight: 10, alignSelf: 'flex-end'}}/>
      //             </TouchableOpacity>
      //           </Col>)
      cols.push(<Col sm={smCol} md={1} lg={1} style={styles.col} key={'check'} />)
    }

    return <View style={styles.gridHeader} key='Datagrid_h1'>
            <Row size={size} style={styles.headerRow} key='Datagrid_h2' nowrap>
              {cols}
            </Row>
          </View>

  }
  checkAll() {
    this.setState({isChecked: !this.state.isChecked})
    this.props.checkAll()
  }
}
GridHeader = makeResponsive(GridHeader)

var styles = StyleSheet.create({
  col: {
    paddingVertical: 5,
    // paddingLeft: 7
    // borderRightColor: '#aaaaaa',
    // borderRightWidth: 0,
  },
  checkCell: {
    paddingVertical: 5,
    alignSelf: 'flex-end',
    paddingRight: 7
  },
  cell: {
    paddingVertical: 5,
    fontSize: 14,
    paddingLeft: 7
  },
  headerRow: {
    borderBottomColor: '#cccccc',
    borderBottomWidth: 1,
  },
  sortAscending:  {
    borderTopWidth: 4,
    borderTopColor: '#7AAAC3'
  },
  sortDescending: {
    borderBottomWidth: 4,
    borderBottomColor: '#7AAAC3'
  },
  gridHeader: {
    backgroundColor: '#eeeeee'
  },
});

module.exports = GridHeader;
