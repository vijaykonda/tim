'use strict'

import utils from '../../utils/utils'
import gql from 'graphql-tag'
import deepEqual from 'deep-equal'
import tradle, { utils as tradleUtils } from '@tradle/engine'
import { ApolloClient, createNetworkInterface } from 'apollo-client'
import constants from '@tradle/constants'
import { print as printQuery } from 'graphql/language/printer'
const {
  TYPE,
  SIG,
  ROOT_HASH,
  CUR_HASH,
  PREV_HASH
} = constants

const { MONEY, ENUM, ORGANIZATION, FORM, MESSAGE } = constants.TYPES
const PHOTO = 'tradle.Photo'
const COUNTRY = 'tradle.Country'
const PUB_KEY = 'tradle.PubKey'

var search = {
  initClient(meDriver, url) {
    // let graphqlEndpoint
    // let orgId = me.organization.id
    // let url = me.organization.url
    // if (!url)
    //   url =  SERVICE_PROVIDERS.filter((sp) => sp.org === orgId)[0].url
    // if (url)
    let graphqlEndpoint = `${url.replace(/[/]+$/, '')}/graphql`
    // else
    //   graphqlEndpoint = `${ENV.LOCAL_TRADLE_SERVER.replace(/[/]+$/, '')}/graphql`
    if (!graphqlEndpoint)
      return

    // graphqlEndpoint = `http://localhost:21012/graphql`
    const networkInterface = createNetworkInterface({
      uri: graphqlEndpoint
    })

    networkInterface.use([{
      applyMiddleware: async (req, next) => {
        const body = tradleUtils.stringify({
          ...req.request,
          query: printQuery(req.request.query)
        })

        const { sig } = await meDriver.sign({
          object: {
            [TYPE]: 'tradle.GraphQLQuery',
            body,
            // time: Date.now()
          }
        })

        if (!req.options.headers) {
          req.options.headers = {}
        }

        req.options.headers['x-tradle-sig'] = sig
        next()
      }
    }])

    networkInterface.useAfter([
      {
        applyAfterware(result, next) {
          const { response } = result
          if (response.status > 300) {
            const err = Error('request failed')
            err.status = response.status
            err.statusText = response.statusText
            err.response = response
            throw err
          }

          next()
        }
      }
    ])

    return new ApolloClient({ networkInterface })
  },

  async searchServer(params) {
    let self = this
    let {client, modelName, filterResource, sortProperty, asc, limit, endCursor, direction, first, properties} = params

    if (filterResource  &&  !Object.keys(filterResource).length)
      filterResource = null

    let table = `rl_${modelName.replace(/\./g, '_')}`
    let model = utils.getModel(modelName)
    let versionId = model._versionId
    let version = versionId ? '($modelsVersionId: String!)' : ''
    let query = `query ${version} {\n${table}\n`
    let props = model.properties
    let inClause = []
    let op = {
      CONTAINS: '',
      EQ: '',
      NEQ: '',
      NULL: '',
      STARTS_WITH: '',
      GT: '',
      GTE: '',
      LT: '',
      LTE: '',
    }
    let exclude = [ROOT_HASH, CUR_HASH, TYPE]
    if (filterResource) {
      for (let p in filterResource) {
        if (exclude.indexOf(p) !== -1)
          continue
        // if (!props[p]  ||  p.charAt(0) === '_')
        //   continue
        let val = filterResource[p]
        // if (p === TYPE) {
        //   if (!Array.isArray(val))
        //     continue
        //   else {
        //     let s = `${p}: [`
        //     val.forEach((r, i) => {
        //       if (i)
        //         s += ', '
        //       s += `"${r}"`
        //     })
        //     s += ']'
        //     inClause.push(s)
        //   }
        // }

        // if (p.charAt(0) === '_')
        //   debugger
        if (!props[p]  &&  val) {
          if (p.charAt(0) === '_') {
            if (Array.isArray(val)) {
              let s = `${p}: [`
              val.forEach((r, i) => {
                if (i)
                  s += ', '
                s += `"${r}"`
              })
              s += ']'
              inClause.push(s)
            }
            else
              op.EQ += `\n   ${p}: "${val}",`
          }
          continue
        }
        else if (props[p].type === 'string') {
          if (Array.isArray(val)) {
            let s = `${p}: [`
            val.forEach((r, i) => {
              if (i)
                s += ', '
              s += `"${r}"`
            })
            s += ']'
            inClause.push(s)
            continue
          }
          else if (!val  ||  !val.trim().length)
            continue
          let len = val.length
          if (val.indexOf('*') === -1)
            op.EQ += `\n   ${p}: "${val}",`
          else if (len > 1) {
            if (val.charAt(0) === '*') {
              if (val.charAt(val.length - 1) === '*')
                op.CONTAINS = `\n   ${p}: "${val.substring(1, len - 1)}",`
              else
                op.STARTS_WITH = `\n   ${p}: "${val.substring(1)}",`
            }
            else if (val.charAt(len - 1) === '*')
              op.CONTAINS = `\n   ${p}: "${val.substring(0, len - 1)}",`
          }
        }
        else if (props[p].type === 'boolean') {
          if (val)
            op.EQ += `\n   ${p}: ${val},`
          else if (val === null)
            op.NULL += `\n ${p}: true`
          else
            op.NEQ += `\n   ${p}: true,`
        }
        else if (props[p].type === 'number')
          self.addEqualsOrGreaterOrLesserNumber(val, op, props[p])

        else if (props[p].type === 'object') {
          // if (Array.isArray(val)) {
          //   let s = `${p}: [`
          //   val.forEach((r, i) => {
          //     if (i)
          //       s += ', '
          //     s += `{id: "${utils.getId(r)}", title: "${utils.getDisplayName(r)}"}`
          //   })
          //   s += ']'
          //   inClause.push(s)
          // }
          if (Array.isArray(val)) {
            if (!val.length)
              continue
            let s = `${p}__id: [`
            val.forEach((r, i) => {
              if (i)
                s += ', '
              s += `"${utils.getId(r)}"`
            })
            s += ']'
            inClause.push(s)
          }
          else {
            if (props[p].ref === MONEY) {
              let {value, currency} = val
              op.EQ += `\n  ${p}__currency: "${currency}",`
              if (val.value)
                addEqualsOrGreaterOrLesserNumber(value, op, props[p])
            }
            else {
              op.EQ += `\n   ${p}__id: "${val.id}",`
            }
          }
        }
        else if (props[p].type === 'array') {
          if (props[p].items.ref) {
            if (!val.length)
              continue
            let s = `${p}__id: [`
            val.forEach((r, i) => {
              if (i)
                s += ', '
              s += `"${utils.getId(r)}"`
            })
            s += ']'
            inClause.push(s)
          }
        }
      }
    }
    op.IN = inClause ? inClause.join(',') : ''

    let qq = ''
    for (let o in op) {
      let q = op[o]
      if (q.length) {
        qq +=
         `\n  ${o}: {
           ${op[o]}\n},`
      }
    }
    query += '('
    if (versionId)
      query += `\nmodelsVersionId: $modelsVersionId\n`
    if (limit) {
      if (endCursor)
        query += `checkpoint: "${endCursor}"\n`
      query += `limit:  ${limit}\n`
    }

    if (qq.length)
      query += `filter: { ${qq} },\n`
    if (sortProperty) {
      let sortBy
      let ref = props[sortProperty].ref
      if (ref) {
        if (ref === MONEY)
          sortBy = sortProperty + '__value'
        else
          sortBy = sortProperty + '__title'
      }
      else
        sortBy = sortProperty
      query += `\norderBy: {
        property: ${sortBy},
        desc: ${asc ? false : true}
      }`
    }
    else
      query += `\norderBy: {
        property: _time,
        desc: true
      }`
    query += ')'
    query += `\n{\n`
    query += `pageInfo {\n endCursor\n}\n`
    query += `edges {\n node {\n`

    let arr = this.getAllPropertiesForServerSearch({model, properties})

    query += `${arr.join('   \n')}`
    query += `\n}`   // close 'node'
    query += `\n}`   // close 'edges'
    query += `\n}`   // close properties block
    query += `\n}`   // close query
console.log('endCursor: ', endCursor)
    try {
      let data = await client.query({
          fetchPolicy: 'network-only',
          errorPolicy: 'all',
          query: gql(`${query}`),
          variables: versionId  &&  {modelsVersionId: versionId}
        })
      return data.data[table]
    } catch(error) {
      // debugger
      console.log(error)
      // throw error
    }

    function prettify (obj) {
      return JSON.stringify(obj, null, 2)
    }
    function addEqualsOrGreaterOrLesserNumber(val, op, prop) {
      let isMoney = prop.ref === MONEY
      let p = prop.name
      if (isMoney)
        p += '__value'
      let ch = val.toString().charAt(0)
      switch (ch) {
      case '>':
        if (val.charAt(1) === '=')
          op.GTE += `\n   ${p}: ${val.substring(2)},`
        else
          op.GT += `\n   ${p}: ${val.substring(1)},`
        break
      case '<':
        if (val.charAt(1) === '=')
          op.LTE += `\n   ${p}: ${val.substring(2)},`
        else
          op.LT += `\n   ${p}: ${val.substring(1)},`
        break
      default:
        op.EQ += `\n   ${p}: ${val},`
      }

    }
  },
                // # _author: "3c67687a96fe59d8f98b1c90cc46f943b938d54cda852b12fb1d43396e28978a"
                // # _inbound: false
                // # _recipient: ${hash}
  async getChat(params) {
    let { author, recipient, client, context, filterResource, limit, endCursor, direction, application } = params
    let table = `rl_${MESSAGE.replace(/\./g, '_')}`
    let contextVar = filterResource || context ? '' : '($context: String)'
    let limitP = limit ? `limit:  ${limit}` : ''
    let checkpoint = limit  &&  endCursor ? `checkpoint: "${endCursor}"\n` : ''
    // let desc = !direction || direction === 'down' ? true : false
    let desc = true
    // if (endCursor)
    //   debugger

    let queryHeader =
       `query ${contextVar} {
          ${table} (
          ${limitP}
          ${checkpoint}
          filter: {
       `
    let queryFooter = `
          }
          orderBy:{
            property: time
            desc: ${desc}
          }
        )
        {
          pageInfo { endCursor }
          edges {
            node {
              _author
              _recipient
              _inbound
              originalSender
              object
              time
              context
            }
          }
        }
      }`


    let eq = `
            EQ: {
            `
    // for app view prevent prevent from displaying double wrapped messages
    if (author) //  &&  (!context ||  application))
      eq += `_counterparty: "${author}"\n`

    let filter = ''
    if (filterResource) {
      for (let p in filterResource) {
        filter += '             ' + p + ': ' + `"${filterResource[p]}"\n`
      }
    }
    eq += filter
    if (context)
      eq += `             context: "${context}"`
    eq += `
            },
          `
    let neq = ''
    if (!context  &&  !filterResource) {
      context = null
      neq = `
            NEQ: {
              context: $context
            }
            `
    }

    let query = queryHeader + eq + neq + queryFooter
    try {
      let result = await client.query({
          fetchPolicy: 'network-only',
          errorPolicy: 'all',
          query: gql(`${query}`),
          variables: filterResource || context ? null : {context: context}
        })
      return result  &&  result.data[table]
    } catch (err) {
      debugger
    }

  },
  getAllPropertiesForServerSearch(params) {
    let {model, inlined, properties, currentProp} = params
    let props = model.properties
    let arr
    if (utils.isInlined(model))
      arr = []
    else {
      arr = ['_permalink', '_link', '_time', '_author', '_authorTitle', '_virtual', 'time']
      if (model.id !== PUB_KEY  &&  !inlined) {
        let newarr = arr.concat(TYPE, SIG)
        arr = newarr
      }
      arr.push(`_seal {
                txId,
                blockchain,
                network,
                time
              }`)
    }
    if (properties) {
      let newProps = {}
      properties.forEach((p) => newProps[p] = props[p])
      props = newProps
    }
    for (let p in props) {
      if (p.charAt(0) === '_')
        continue
      if (p === 'from' || p === 'to' || p === 'time'  ||  p.indexOf('_group') !== -1)
        continue
      let prop = props[p]
      if (prop.displayAs)
        continue
      let ptype = prop.type
      if (ptype === 'array') {
        // HACK
        if (p === 'verifications')
          continue
        let iref = prop.items.ref
        if (iref) {
          if (prop.items.backlink)
            continue
          if (prop.inlined) {
            if (currentProp  &&  currentProp === prop)
              continue
            arr.push(this.addInlined(prop))
          }
          else if (iref === model.id) {
            arr.push(
              `${p} {
                id
              }`
            )
          }
          // else if (prop.inlined)
          //   arr.push(this.addInlined(prop))
          else
            arr.push(
              `${p} {
                id
                title
              }`
            )
        }

        continue
      }
      if (ptype !== 'object') {
        arr.push(p)
        continue
      }
      let ref = prop.ref
      if (!ref) {
        if (prop.range === 'json')
          arr.push(p)
        continue
      }
      if (ref === ORGANIZATION)
        continue

      if (prop.inlined)
        arr.push(this.addInlined(prop))
      else
        arr.push(this.addRef(prop))
    }
    return arr
  },
  addRef(prop) {
    let ref = prop.type === 'array' ? prop.items.ref : prop.ref
    let p = prop.name
    if (ref === MONEY) {
      return (
        `${p} {
          value
          currency
        }`
      )
    }

    if (ref === COUNTRY) {//   ||  ref === CURRENCY)
      return (
        `${p} {
          id
          title
        }`
      )
    }
    let m = utils.getModel(ref)
    if (m.subClassOf === ENUM) {
      if (m.enum)
        return (
          `${p} {
            id
            title
          }`
        )
      else
        return p
    }
    if (m.id === PHOTO) {
      return (
        `${p} {${this.getAllPropertiesForServerSearch({model: m})}}`
      )
    }
    return (
      `${p} {
        id
        title
      }`
    )
  },
  addInlined(prop) {
    let ref = prop.type === 'array' ? prop.items.ref : prop.ref
    let p = prop.name
    let refM = utils.getModel(ref)
    if (prop.range === 'json')
      return p
    if (refM.abstract)
      return p
    if (/*ref === FORM  || */ refM.isInterface  ||  refM.subClassOf === ENUM) {
      return (
        `${p} {
          id
          title
        }`
      )
    }
    else {
      let allProps = this.getAllPropertiesForServerSearch({model: refM, inlined: true, currentProp: prop})
      return (
        `${p} {
          ${allProps.toString().replace(/,/g, '\n')}
        }`
      )
    }
  },
  async _getItem(id, client) {
    let parts = id.split('_')

    let modelName = parts[0]
    let model = utils.getModel(modelName)
    if (!model)
      return

    let table = `r_${modelName.replace(/\./g, '_')}`

    // let _link = parts[parts.length - 1]
    let _permalink = parts[1]
    let query = `query {\n${table} (_permalink: "${_permalink}")\n`

    let arr = this.getAllPropertiesForServerSearch({model})

    query += `\n{${arr.join('   \n')}\n}\n}`
    try {
      let result = await client.query({
        fetchPolicy: 'network-only',
        errorPolicy: 'all',
        query: gql(`${query}`)
      })
      return result.data[table]
    }
    catch(err) {
      console.log('graphQL._getItem', err)
      debugger
    }
  },
  async getObjects(links, client) {
    let table = 'rl_objects'
    let query = `
    query {
        ${table} (
          links: ["${links.join('","')}"]
        )
        {
          objects
        }
     }`
    try {
      let result = await client.query({
        fetchPolicy: 'network-only',
        errorPolicy: 'all',
        query: gql(`${query}`)
      })
      return result.data[table]  &&  result.data[table].objects
    }
    catch(err) {
      console.log('graphQL._getItem', err)
      debugger
    }
  }
}
module.exports = search
  // addEndCursor(params, query) {
  //   let {modelName, filterResource, limit, direction, first, noPaging} = params
  //   if (noPaging)
  //     return

  //   if (first  ||  cursor.modelName !== modelName) {
  //     cursor = {endCursor: []}
  //     return
  //   }
  //   if (!limit)
  //     return
  //   if (cursor) {
  //     if (cursor.filter) {
  //       if (!filterResource  ||  !deepEqual(filterResource,  cursor.filter))
  //         cursor = {endCursor: []}
  //     }
  //   }
  //   cursor.endCursor = cursor.endCursor || []
  //   cursor.modelName = modelName
  //   cursor.filter = filterResource || null

  //   let endCursor
  //   let len = cursor.endCursor.length
  //   if (!len)
  //     return
  //   if (direction === 'down')
  //     endCursor = cursor.endCursor[len - 1]
  //   else {
  //     if (len > 2) {
  //       cursor.endCursor.splice(len - 2, 1)
  //       cursor.endCursor.splice(len - 1, 1)
  //       len -= 2
  //     }
  //     else
  //       cursor.endCursor = []
  //     endCursor = (len - 1) ? cursor.endCursor[len - 2] : null
  //   }
  //   if (endCursor)
  //     query += `checkpoint: "${endCursor}"\n`
  //   query += `limit:  ${limit}\n`
  // }
  // async getChat1(params) {
  //   let { author, recipient, client, context, filterResource, inboundOnly, outboundOnly } = params
  //   let table = `rl_${MESSAGE.replace(/\./g, '_')}`
  //   let contextVar = filterResource || context ? '' : '($context: String)'
  //   let queryHeader =
  //      `query ${contextVar} {
  //         ${table} (
  //      `
  //   let endCursor = this.getEndCursor(params)
  //   if (endCursor)
  //     query += `checkpoint: "${endCursor}"\n`

  //   query += ` filter: {\n`
  //   let queryFooter = `
  //         }
  //         orderBy:{
  //           property: time
  //           desc:true
  //         }
  //       )
  //       {
  //         pageInfo { endCursor }
  //         edges {
  //           node {
  //             _author
  //             _recipient
  //             _inbound
  //             originalSender
  //             object
  //             context
  //           }
  //         }
  //       }
  //     }`


  //   let eq = `
  //           EQ: {
  //             _inbound: true
  //           `
  //   if (author)
  //     eq += `              _author: "${author}"\n`

  //   let filter = ''
  //   if (filterResource) {
  //     for (let p in filterResource) {
  //       filter += '             ' + p + ': ' + `"${filterResource[p]}"\n`
  //     }
  //   }
  //   eq += filter
  //   if (context)
  //     eq += `             context: "${context}"`
  //   eq += `
  //           },
  //         `
  //   let neq = ''
  //   if (!context  &&  !filterResource) {
  //     context = null
  //     neq = `
  //           NEQ: {
  //             context: $context
  //           }
  //           `
  //   }

  //   let query = queryHeader + eq + neq + queryFooter

  //   // let query =
  //   //     `query {
  //   //         rl_tradle_Message(
  //   //         limit: 20,
  //   //         filter:{
  //   //           EQ: {
  //   //             _inbound: true
  //   //             context: "${context}"
  //   //             _author: "${author}"
  //   //           }
  //   //         },
  //   //         orderBy:{
  //   //           property: time
  //   //           desc:true
  //   //         }
  //   //       ) {
  //   //         edges {
  //   //           node {
  //   //             _author
  //   //             _recipient
  //   //             object
  //   //           }
  //   //         }
  //   //       }
  //   //     }`
  //   let promisses = []
  //   promisses.push(client.query({
  //         fetchPolicy: 'network-only',
  //         query: gql(`${query}`),
  //       }))

  //   eq = `
  //           EQ: {
  //             _inbound: false
  //         `
  //   if (author)
  //     eq += `              _recipient: "${author}"\n`
  //   eq += filter
  //   if (context)
  //     eq += `             context: "${context}"`
  //   eq += `
  //           },
  //         `

  //   let queryOutbound = queryHeader + eq + neq + queryFooter

  //   // let queryOutbound = query.replace('_inbound: true', '_inbound: false').replace('_author', '_recipient')
  //       // `query {
  //       //     rl_tradle_Message(
  //       //     limit: 20,
  //       //     filter:{
  //       //       EQ: {
  //       //         _inbound: false
  //       //         context: "${context}"
  //       //         _recipient: "${author}"
  //       //       }
  //       //     },
  //       //     orderBy:{
  //       //       property: time
  //       //       desc:true
  //       //     }
  //       //   ) {
  //       //     edges {
  //       //       node {
  //       //         _author
  //       //         _recipient
  //       //         object
  //       //       }
  //       //     }
  //       //   }
  //       // }`

  //   promisses.push(client.query({
  //         fetchPolicy: 'network-only',
  //         query: gql(`${queryOutbound}`),
  //         variables: filterResource || context ? null : {context: context}
  //       }))
  //   try {
  //     let all = await Promise.all(promisses)
  //     return all
  //     // let result = []
  //     // let inbound = true
  //     // let outbound = false
  //     // for (let i=0; i<2; i++) {
  //     //   let list = all[i].data[table]
  //     //   if (list.edges  &&  list.edges.length) {
  //     //     list.edges.forEach(r => {
  //     //       r.node.object._inbound = inbound
  //     //       r.node.object._outbound = outbound
  //     //       result.push(r.node)
  //     //     })
  //     //   }
  //     //   inbound = false
  //     //   outbound = true
  //     // }
  //     // // result.sort((a, b) => a.time - b.time)
  //     // return result
  //   } catch (err) {
  //     debugger
  //   }

  // },
